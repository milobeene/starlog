/**
 * 화면 단위 조회 — 목록·파셋·사이드바·휴지통·상세. **쿼리 몇 방 + 메모리에서 묶기**로 카드·상세를 만든다.
 *
 * 컬렉션(장르·개발사)에 `order by`가 없는 건 의도다 — 화면에 보이는 순서는 DB가 주는 (힙) 순서이고,
 * 정렬을 넣으면 기존 데이터의 표시 순서가 바뀐다
 */
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../../db/client";
import { rows, one } from "../../db/raw";
import { Conflict, InvalidInput } from "../../common/errors";
import { ldt, moneyJson, page as pageOf } from "../../common/json";
import { amountJson } from "../../common/money";
import { normalize } from "../../common/text";
import { coverPublicUrl } from "./media";
import type { BacklogStatus } from "./shared";
import { findAliveEntry404, findEntryIncludingDeleted, type EntryRow } from "./shared";
import { masterInfo } from "../game/service";

const MAX_SIZE = 100;
export const normalizeSize = (size: number) => Math.min(Math.max(size, 1), MAX_SIZE);
export const normalizePage = (page: number) => Math.max(page, 0);

// ───────────── 정렬 ─────────────

const SORTS = {
  lastPlayed: sql`b.last_played_on desc nulls last`,
  rating: sql`b.rating desc nulls last`,
  releasedOn: sql`b.released_on_resolved desc nulls last`,
  name: sql`b.display_name asc`,
  playtime: sql`b.play_time_hours desc nulls last`,
} as const;
export type BacklogSort = keyof typeof SORTS;

/** 대소문자·언더스코어를 흡수한다 (`_`는 전부 제거) */
export function sortFrom(value: string | null): BacklogSort {
  const stripped = normalize(value);
  if (stripped === null) return "lastPlayed";
  const normalized = stripped.replaceAll("_", "").toLowerCase();
  const found = (Object.keys(SORTS) as BacklogSort[]).find((k) => k.toLowerCase() === normalized);
  if (!found) throw new InvalidInput(`지원하지 않는 정렬입니다: ${value}`);
  return found;
}

/** 최근 플레이순에서만 진행 중을 맨 앞으로. 그 뒤 BR-QRY-01(lastPlayedOn), 마지막은 id */
function orderBy(sort: BacklogSort): SQL {
  const parts: SQL[] = [];
  if (sort === "lastPlayed") parts.push(sql`case when b.status = 'PLAYING' then 1 else 0 end desc`);
  parts.push(SORTS[sort]);
  if (sort !== "lastPlayed") parts.push(SORTS.lastPlayed);
  parts.push(sql`b.id desc`);
  return sql.join(parts, sql`, `);
}

// ───────────── 검색 조건 ─────────────

export interface SearchCondition {
  keyword: string | null;
  statuses: BacklogStatus[];
  tagId: number | null;
  genreId: number | null;
  genreName: string | null;
  developer: string | null;
  releaseYear: number | null;
  ptDeviceId: number | null;
  ptPlatformId: number | null;
  ptEmulatorId: number | null;
  ptAccountId: number | null;
  ptFrom: string | null;
  ptTo: string | null;
  acqMethod: string | null;
  acqCurrency: string | null;
  acqMinPrice: string | null;
  acqMaxPrice: string | null;
  acqPlatformId: number | null;
  acqAccountId: number | null;
  acqFrom: string | null;
  acqTo: string | null;
}

/**
 * 대소문자 무시 부분 일치 — `lower(x) like '%kw%' escape '!'`. 키워드는 소문자로 바꾸고
 * `%`·`_`·`!`를 `!`로 이스케이프한다 (입력한 `%`·`_`가 와일드카드로 읽히면 안 된다)
 */
function containsIc(column: SQL, keyword: string): SQL {
  const escaped = keyword.toLowerCase().replace(/[!%_]/g, (c) => "!" + c);
  return sql`lower(${column}) like ${"%" + escaped + "%"} escape '!'`;
}

/** 필터는 join이 아니라 exists — 행이 안 늘어나 count가 맞는다 */
function predicates(c: SearchCondition): SQL {
  const w: SQL[] = [sql`b.deleted_at is null`];

  // 표시 이름(한글 오버라이드일 수 있다) **또는 마스터 이름**(IGDB 원제) — `mario`로 `슈퍼 마리오`를 찾는다
  if (c.keyword !== null) {
    w.push(sql`(${containsIc(sql`b.display_name`, c.keyword)}
               or exists (select 1 from game mg where mg.id = b.game_id and ${containsIc(sql`mg.name`, c.keyword)}))`);
  }
  if (c.statuses.length) w.push(sql`b.status in ${c.statuses}`);
  if (c.tagId !== null) w.push(sql`b.tag_id = ${c.tagId}`);
  if (c.genreId !== null) {
    w.push(sql`exists (select 1 from backlog_entry_genre l where l.backlog_entry_id = b.id and l.genre_id = ${c.genreId})`);
  }
  if (c.genreName !== null) {
    // 표시값 기준 — 개인 장르가 하나라도 있으면 그것만, 없으면 마스터 장르에서
    w.push(sql`(exists (select 1 from backlog_entry_genre l join genre g on g.id = l.genre_id
                          where l.backlog_entry_id = b.id and lower(g.name) = lower(${c.genreName}))
               or (not exists (select 1 from backlog_entry_genre l where l.backlog_entry_id = b.id)
                   and exists (select 1 from game_master_genre mg
                                where mg.game_id = b.game_id and lower(mg.genre) = lower(${c.genreName}))))`);
  }
  if (c.developer !== null) {
    w.push(sql`(exists (select 1 from backlog_developer_override o
                          where o.backlog_entry_id = b.id and ${containsIc(sql`o.developer`, c.developer)})
               or (not exists (select 1 from backlog_developer_override o where o.backlog_entry_id = b.id)
                   and exists (select 1 from game_developer gd
                                where gd.game_id = b.game_id and ${containsIc(sql`gd.developer`, c.developer)})))`);
  }
  if (c.releaseYear !== null) w.push(sql`extract(year from b.released_on_resolved) = ${c.releaseYear}`);

  // 회차 축 — **한 회차가 조건을 모두 만족해야 한다.** 날짜는 기간 겹침, 진행 중은 살아 있는 것으로
  const ptFilter = c.ptDeviceId !== null || c.ptPlatformId !== null || c.ptEmulatorId !== null
    || c.ptAccountId !== null || c.ptFrom !== null || c.ptTo !== null;
  if (ptFilter) {
    const p: SQL[] = [sql`p.backlog_entry_id = b.id`];
    if (c.ptDeviceId !== null) p.push(sql`p.device_id = ${c.ptDeviceId}`);
    if (c.ptPlatformId !== null) p.push(sql`p.platform_id = ${c.ptPlatformId}`);
    if (c.ptEmulatorId !== null) p.push(sql`p.emulator_id = ${c.ptEmulatorId}`);
    if (c.ptAccountId !== null) p.push(sql`p.platform_account_id = ${c.ptAccountId}`);
    if (c.ptTo !== null) p.push(sql`p.started_on <= ${c.ptTo}`);
    if (c.ptFrom !== null) p.push(sql`(p.finished_on is null or p.finished_on >= ${c.ptFrom})`);
    w.push(sql`exists (select 1 from playthrough p where ${sql.join(p, sql` and `)})`);
  }

  // 취득 축. ⚠️ 통화를 빠뜨리면 통화만 고른 필터가 조용히 무시된다
  const acqFilter = c.acqMethod !== null || c.acqCurrency !== null || c.acqMinPrice !== null || c.acqMaxPrice !== null
    || c.acqPlatformId !== null || c.acqAccountId !== null || c.acqFrom !== null || c.acqTo !== null;
  if (acqFilter) {
    const a: SQL[] = [sql`a.backlog_entry_id = b.id`];
    if (c.acqMethod !== null) a.push(sql`a.method = ${c.acqMethod}`);
    if (c.acqPlatformId !== null) a.push(sql`a.platform_id = ${c.acqPlatformId}`);
    if (c.acqAccountId !== null) a.push(sql`a.platform_account_id = ${c.acqAccountId}`);
    if (c.acqCurrency !== null) a.push(sql`a.price_currency = ${c.acqCurrency}`);
    if (c.acqMinPrice !== null) a.push(sql`a.price_amount >= ${c.acqMinPrice}::numeric`);
    if (c.acqMaxPrice !== null) a.push(sql`a.price_amount <= ${c.acqMaxPrice}::numeric`);
    if (c.acqFrom !== null) a.push(sql`a.acquired_on >= ${c.acqFrom}`);
    if (c.acqTo !== null) a.push(sql`a.acquired_on <= ${c.acqTo}`);
    w.push(sql`exists (select 1 from acquisition a where ${sql.join(a, sql` and `)})`);
  }
  return sql.join(w, sql` and `);
}

// ───────────── 카드 ─────────────

const ENTRY_COLUMNS = sql`b.id, b.game_id as "gameId", b.status, b.display_name as "displayName",
  b.name_override as "nameOverride", b.released_on_override as "releasedOnOverride", b.released_on_resolved as "releasedOnResolved",
  b.list_price_override_amount as "listPriceOverrideAmount", b.list_price_override_currency as "listPriceOverrideCurrency",
  b.rating, b.play_time_hours as "playTimeHours", b.last_played_on as "lastPlayedOn", b.last_playthrough_id as "lastPlaythroughId",
  b.tag_id as "tagId", b.memo, b.deleted_at as "deletedAt", b.created_at as "createdAt", b.updated_at as "updatedAt",
  b.display_name_sort_key as "displayNameSortKey"`;

export async function search(d: Db, c: SearchCondition, page: number, size: number, sort: BacklogSort) {
  const p = normalizePage(page), s = normalizeSize(size);
  const where = predicates(c);
  const entries = await rows<EntryRow>(d, sql`select ${ENTRY_COLUMNS} from backlog_entry b
    join game gm on gm.id = b.game_id
    where ${where} order by ${orderBy(sort)} limit ${s} offset ${p * s}`);
  const total = (await one<{ n: number }>(d, sql`select count(b.id)::int as n from backlog_entry b where ${where}`))!.n;
  return pageOf(await toCards(d, entries), p, s, total);
}

/** 전량 — 사이드바·폴더. 정렬은 이름순 하나 */
export async function findAllCards(d: Db) {
  const entries = await rows<EntryRow>(d, sql`select ${ENTRY_COLUMNS} from backlog_entry b
    join game gm on gm.id = b.game_id
    where b.deleted_at is null order by ${orderBy("name")}`);
  return toCards(d, entries);
}

const ids = (xs: (number | null)[]) => [...new Set(xs.filter((x): x is number => x !== null))];

function groupBy<T, K>(list: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of list) { const k = key(x); const arr = m.get(k); if (arr) arr.push(x); else m.set(k, [x]); }
  return m;
}

/** 개인 장르 이름 — 항목별, DB가 준 순서 그대로 */
async function personalGenres(d: Db, entryIds: number[]): Promise<Map<number, string[]>> {
  if (!entryIds.length) return new Map();
  const links = await rows<{ entryId: number; genreId: number }>(d, sql`select backlog_entry_id as "entryId", genre_id as "genreId"
    from backlog_entry_genre where backlog_entry_id in ${entryIds}`);
  const genreIds = ids(links.map((l) => l.genreId));
  const names = new Map((genreIds.length
    ? await rows<{ id: number; name: string }>(d, sql`select id, name from genre where id in ${genreIds}`) : []).map((g) => [g.id, g.name]));
  const out = new Map<number, string[]>();
  for (const l of links) {
    const arr = out.get(l.entryId) ?? [];
    arr.push(names.get(l.genreId)!);
    out.set(l.entryId, arr);
  }
  return out;
}

/** 게임의 값 컬렉션(개발사·유통사·마스터 장르·출시 플랫폼) — 게임별, DB 순서 그대로 */
async function gameValues(d: Db, table: "game_developer" | "game_publisher" | "game_master_genre" | "game_release_platform",
                          column: string, gameIds: number[]): Promise<Map<number, string[]>> {
  if (!gameIds.length) return new Map();
  const list = await rows<{ gameId: number; v: string }>(d, sql`select game_id as "gameId", ${sql.identifier(column)} as v
    from ${sql.identifier(table)} where game_id in ${gameIds}`);
  return new Map([...groupBy(list, (x) => x.gameId)].map(([k, v]) => [k, v.map((x) => x.v)]));
}

/** 주소를 못 만드는 커버(EXTERNAL + 스토리지 미설정)는 빼고 그린다 — 화면이 마스터 커버로 폴백한다 */
async function coverUrls(d: Db, entryIds: number[]): Promise<Map<number, string>> {
  if (!entryIds.length) return new Map();
  const covers = await rows<{ entryId: number; storageKey: string; location: string }>(d, sql`select backlog_entry_id as "entryId",
    storage_key as "storageKey", location from cover_image where backlog_entry_id in ${entryIds}`);
  const out = new Map<number, string>();
  for (const cover of covers) {
    const url = coverPublicUrl(cover);
    if (url !== null) out.set(cover.entryId, url);
  }
  return out;
}

async function toCards(d: Db, entries: EntryRow[]) {
  const entryIds = entries.map((e) => e.id);
  const gameIds = ids(entries.map((e) => e.gameId));
  const games = new Map((gameIds.length
    ? await rows<{ id: number; name: string; coverImageId: string | null }>(d, sql`select id, name, cover_image_id as "coverImageId" from game where id in ${gameIds}`)
    : []).map((g) => [g.id, g]));
  const tagIds = ids(entries.map((e) => e.tagId));
  const tags = new Map((tagIds.length
    ? await rows<{ id: number; name: string }>(d, sql`select id, name from tag where id in ${tagIds}`) : []).map((t) => [t.id, t.name]));
  const ptIds = ids(entries.map((e) => e.lastPlaythroughId));
  const pts = new Map((ptIds.length
    ? await rows<{ id: number; sequenceNo: number; startedOn: string; finishedOn: string | null; deviceName: string | null; emulatorName: string | null }>(d,
      sql`select p.id, p.sequence_no as "sequenceNo", p.started_on as "startedOn", p.finished_on as "finishedOn",
                 dv.label as "deviceName", em.name as "emulatorName"
            from playthrough p left join device dv on dv.id = p.device_id left join emulator em on em.id = p.emulator_id
           where p.id in ${ptIds}`) : []).map((p) => [p.id, p]));
  const personal = await personalGenres(d, entryIds);
  const master = await gameValues(d, "game_master_genre", "genre", gameIds);
  const covers = await coverUrls(d, entryIds);

  return entries.map((e) => {
    const pt = e.lastPlaythroughId === null ? null : pts.get(e.lastPlaythroughId) ?? null;
    const mine = personal.get(e.id) ?? [];
    return {
      entryId: e.id,
      coverUrl: covers.get(e.id) ?? null,
      displayName: e.displayName,
      genres: mine.length ? mine : master.get(e.gameId) ?? [],
      rating: amountJson(e.rating),
      status: e.status,
      lastPlaythrough: pt === null ? null : {
        sequenceNo: pt.sequenceNo, startedOn: pt.startedOn, finishedOn: pt.finishedOn,
        deviceName: pt.deviceName, emulatorName: pt.emulatorName,
      },
      coverImageId: games.get(e.gameId)?.coverImageId ?? null,
      tag: e.tagId === null ? null : tags.get(e.tagId) ?? null,
      // 마스터 이름(IGDB 원제) — 화면이 전량 목록을 손에서 거를 때 원제로도 찾게 (서버 검색 `q`와 같은 규칙)
      masterName: games.get(e.gameId)?.name ?? null,
      // 정렬 기준에 따라 카드 둘째 줄에 쓴다 (플레이 시간·출시일 정렬)
      playTimeHours: amountJson(e.playTimeHours),
      releasedOn: e.releasedOnResolved,
    };
  });
}

// ───────────── 파셋 ─────────────

export async function findFacets(d: Db) {
  const tags = await rows(d, sql`select t.id, t.name, count(b.id)::int as count, t.color
      from backlog_entry b join tag t on t.id = b.tag_id
     where b.deleted_at is null and b.tag_id is not null
     group by t.id, t.name, t.sort_order, t.color
     order by t.sort_order asc, t.name asc`);
  // 개인 장르 기준 — 마스터 폴백은 세지 않는다
  const genres = await rows(d, sql`select g.id, g.name, count(distinct l.backlog_entry_id)::int as count
      from backlog_entry_genre l join genre g on g.id = l.genre_id join backlog_entry b on b.id = l.backlog_entry_id
     where b.deleted_at is null
     group by g.id, g.name order by g.name asc`);
  const statuses = await rows(d, sql`select b.status, count(b.id)::int as count from backlog_entry b
     where b.deleted_at is null group by b.status order by b.status asc`);
  const devices = await rows(d, sql`select dv.id, dv.label as name, count(distinct p.backlog_entry_id)::int as count
      from playthrough p join backlog_entry b on b.id = p.backlog_entry_id join device dv on dv.id = p.device_id
     where b.deleted_at is null and p.device_id is not null
     group by dv.id, dv.label order by dv.label asc`);
  // 이름에 소속을 붙인다 — `(Steam) Beene`. 에뮬 소속 계정이 빠지지 않게 명시 left join
  const platformAccounts = await rows(d, sql`select pa.id, '(' || coalesce(pl.name, em.name) || ') ' || pa.account_label as name,
           count(distinct a.backlog_entry_id)::int as count
      from acquisition a join platform_account pa on pa.id = a.platform_account_id
      left join platform pl on pl.id = pa.platform_id left join emulator em on em.id = pa.emulator_id
      join backlog_entry b on b.id = a.backlog_entry_id
     where b.deleted_at is null and pa.deleted_at is null
     group by pa.id, pa.account_label, pl.name, em.name
     order by coalesce(pl.name, em.name) asc, pa.account_label asc, pa.id asc`);
  return { tags, genres, statuses, devices, platformAccounts };
}

// ───────────── 사이드바·휴지통·사전 ─────────────

export function findNames(d: Db) {
  return rows<{ entryId: number; displayName: string }>(d, sql`select b.id as "entryId", b.display_name as "displayName"
      from backlog_entry b where b.deleted_at is null
     order by lower(b.display_name) asc, b.id asc`);
}

export async function findDeleted(d: Db, page: number, size: number) {
  const p = normalizePage(page), s = normalizeSize(size);
  const list = await rows<{ entryId: number; displayName: string; deletedAt: string }>(d, sql`select b.id as "entryId",
         b.display_name as "displayName", b.deleted_at as "deletedAt"
      from backlog_entry b where b.deleted_at is not null
     order by b.deleted_at desc, b.id desc limit ${s} offset ${p * s}`);
  const total = (await one<{ n: number }>(d, sql`select count(b.id)::int as n from backlog_entry b
     where b.deleted_at is not null`))!.n;
  return pageOf(list.map((x) => ({ ...x, deletedAt: ldt(x.deletedAt) })), p, s, total);
}

/** 미리보기 — **삭제된 것만** 의미가 있다. 살아 있으면 409 */
export async function findDeletedDetail(d: Db, entryId: number) {
  const e = await findEntryIncludingDeleted(d, entryId);
  if (e.deletedAt === null) throw new Conflict(`삭제되지 않은 항목입니다. id=${entryId}`);
  const game = (await one<{ coverImageId: string | null }>(d, sql`select cover_image_id as "coverImageId" from game where id = ${e.gameId}`))!;
  const mine = (await personalGenres(d, [e.id])).get(e.id) ?? [];
  const genres = mine.length ? mine : (await gameValues(d, "game_master_genre", "genre", [e.gameId])).get(e.gameId) ?? [];
  const counts = (await one<{ pt: number; acq: number }>(d, sql`select
      (select count(*)::int from playthrough where backlog_entry_id = ${e.id}) as pt,
      (select count(*)::int from acquisition where backlog_entry_id = ${e.id}) as acq`))!;
  return {
    entryId: e.id,
    displayName: e.displayName,
    deletedAt: ldt(e.deletedAt),
    createdAt: ldt(e.createdAt),
    coverImageId: game.coverImageId,
    rating: amountJson(e.rating),
    playTimeHours: amountJson(e.playTimeHours),
    memo: e.memo,
    genres,
    playthroughCount: counts.pt,
    acquisitionCount: counts.acq,
  };
}

/**
 * 개발사·유통사 사전. 표시값 기준이라 두 방 — 오버라이드가 있으면 그것만, 비면 마스터.
 * 정렬은 `caseInsensitive`(안정 정렬), 중복 제거는 대소문자까지 같은 것만
 */
export async function findCompanies(d: Db) {
  const q = (s: SQL) => rows<{ v: string }>(d, s).then((r) => r.map((x) => x.v));
  const alive = sql`b.deleted_at is null`;
  const devOverrides = await q(sql`select distinct o.developer as v from backlog_entry b
      join backlog_developer_override o on o.backlog_entry_id = b.id where ${alive}`);
  const pubOverrides = await q(sql`select distinct o.publisher as v from backlog_entry b
      join backlog_publisher_override o on o.backlog_entry_id = b.id where ${alive}`);
  const masterDevs = await q(sql`select distinct gd.developer as v from backlog_entry b join game g on g.id = b.game_id
      join game_developer gd on gd.game_id = g.id
     where ${alive} and not exists (select 1 from backlog_developer_override o where o.backlog_entry_id = b.id)`);
  const masterPubs = await q(sql`select distinct gp.publisher as v from backlog_entry b join game g on g.id = b.game_id
      join game_publisher gp on gp.game_id = g.id
     where ${alive} and not exists (select 1 from backlog_publisher_override o where o.backlog_entry_id = b.id)`);
  const sorted = (xs: string[]) => [...new Set(xs)].sort(caseInsensitive);
  return {
    developers: sorted([...devOverrides, ...masterDevs]),
    publishers: sorted([...pubOverrides, ...masterPubs]),
    overriddenDevelopers: sorted(devOverrides),
    overriddenPublishers: sorted(pubOverrides),
  };
}

/** 대소문자 무시 정렬 — UTF-16 단위로 대문자, 그다음 소문자 비교. `localeCompare`와 순서가 달라 직접 구현했다 */
function caseInsensitive(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let c1 = a.charCodeAt(i), c2 = b.charCodeAt(i);
    if (c1 === c2) continue;
    c1 = upper(c1); c2 = upper(c2);
    if (c1 === c2) continue;
    c1 = lower(c1); c2 = lower(c2);
    if (c1 !== c2) return c1 - c2;
  }
  return a.length - b.length;
}
// 한 글자를 한 글자로만 바꾼다 (`ß`는 그대로 — JS `toUpperCase`는 `SS`가 된다)
const upper = (c: number) => { const s = String.fromCharCode(c).toUpperCase(); return s.length === 1 ? s.charCodeAt(0) : c; };
const lower = (c: number) => { const s = String.fromCharCode(c).toLowerCase(); return s.length === 1 ? s.charCodeAt(0) : c; };

// ───────────── 상세 ─────────────

export async function findDetail(d: Db, entryId: number) {
  const e = await findAliveEntry404(d, entryId);
  const master = await masterInfo(d, e.gameId);
  const tagName = e.tagId === null ? null
    : (await one<{ name: string }>(d, sql`select name from tag where id = ${e.tagId}`))?.name ?? null;

  const cover = await one<{ entryId: number; storageKey: string; location: string }>(d, sql`select backlog_entry_id as "entryId",
      storage_key as "storageKey", location from cover_image where backlog_entry_id = ${entryId}`);
  const coverUrl = cover ? coverPublicUrl(cover) : null;

  const devOverrides = (await rows<{ v: string }>(d, sql`select developer as v from backlog_developer_override
      where backlog_entry_id = ${e.id}`)).map((x) => x.v);
  const pubOverrides = (await rows<{ v: string }>(d, sql`select publisher as v from backlog_publisher_override
      where backlog_entry_id = ${e.id}`)).map((x) => x.v);
  const personal = (await personalGenres(d, [e.id])).get(e.id) ?? [];

  const overridePrice = moneyJson(e.listPriceOverrideAmount, e.listPriceOverrideCurrency);

  const playthroughs = await rows<Record<string, unknown>>(d, sql`select p.id as "playthroughId", p.sequence_no as "sequenceNo",
      p.started_on as "startedOn", p.finished_on as "finishedOn", p.status, p.label,
      dv.id as "deviceId", dv.label as "deviceLabel", dv.device_type as "deviceType",
      pl.id as "platformId", pl.name as "platformName",
      pa.id as "accountId", pa.account_label as "accountLabel",
      em.id as "emulatorId", em.name as "emulatorName",
      im.id as "inputMethodId", im.name as "inputMethodName"
      from playthrough p
      left join device dv on dv.id = p.device_id
      left join platform pl on pl.id = p.platform_id
      left join platform_account pa on pa.id = p.platform_account_id
      left join emulator em on em.id = p.emulator_id
      left join input_method im on im.id = p.input_method_id
     where p.backlog_entry_id = ${e.id} order by p.sequence_no asc`);
  const acquisitions = await rows<Record<string, unknown>>(d, sql`select a.id as "acquisitionId", a.method,
      pl.id as "platformId", pl.name as "platformName",
      pa.id as "accountId", pa.account_label as "accountLabel",
      s.id as "subscriptionId", s.service_name as "serviceName",
      a.price_amount as "priceAmount", a.price_currency as "priceCurrency", a.acquired_on as "acquiredOn", a.label
      from acquisition a
      left join platform pl on pl.id = a.platform_id
      left join platform_account pa on pa.id = a.platform_account_id
      left join subscription s on s.id = a.subscription_id
     where a.backlog_entry_id = ${e.id} order by a.id asc`);

  return {
    entryId: e.id,
    status: e.status,
    createdAt: ldt(e.createdAt),
    resolved: {
      name: e.displayName,
      developers: devOverrides.length ? devOverrides : master.developers,
      publishers: pubOverrides.length ? pubOverrides : master.publishers,
      releasedOn: e.releasedOnOverride ?? master.releasedOn,
      listPrice: overridePrice ?? master.listPrice,
      genres: personal.length ? personal : master.genres,
      cover: coverUrl !== null ? { source: "PERSONAL", url: coverUrl, imageId: null }
        : master.coverImageId !== null ? { source: "MASTER", url: null, imageId: master.coverImageId }
          : { source: "NONE", url: null, imageId: null },
    },
    master,
    overrides: {
      name: e.nameOverride,
      developers: devOverrides,
      publishers: pubOverrides,
      releasedOn: e.releasedOnOverride,
      listPrice: overridePrice,
    },
    personalRecord: { rating: amountJson(e.rating), playTimeHours: amountJson(e.playTimeHours), memo: e.memo },
    tag: tagName,
    genres: personal,
    playthroughs: playthroughs.map((p) => ({
      playthroughId: p.playthroughId,
      sequenceNo: p.sequenceNo,
      startedOn: p.startedOn,
      finishedOn: p.finishedOn,
      status: p.status,
      label: p.label,
      // 선택지 목록과 같은 문구 — "거실 스위치 (Nintendo Switch)"
      device: p.deviceId === null ? null : {
        deviceId: p.deviceId,
        name: p.deviceLabel === p.deviceType ? p.deviceLabel : `${p.deviceLabel} (${p.deviceType})`,
      },
      platform: p.platformId === null ? null : { platformId: p.platformId, name: p.platformName },
      platformAccount: p.accountId === null ? null : { accountId: p.accountId, label: p.accountLabel },
      emulator: p.emulatorId === null ? null : { emulatorId: p.emulatorId, name: p.emulatorName },
      inputMethod: p.inputMethodId === null ? null : { inputMethodId: p.inputMethodId, name: p.inputMethodName },
    })),
    acquisitions: acquisitions.map((a) => ({
      acquisitionId: a.acquisitionId,
      method: a.method,
      platform: a.platformId === null ? null : { platformId: a.platformId, name: a.platformName },
      platformAccount: a.accountId === null ? null : { accountId: a.accountId, label: a.accountLabel },
      subscription: a.subscriptionId === null ? null : { subscriptionId: a.subscriptionId, serviceName: a.serviceName },
      price: moneyJson(a.priceAmount as string | null, a.priceCurrency as string | null),
      acquiredOn: a.acquiredOn,
      label: a.label,
    })),
  };
}
