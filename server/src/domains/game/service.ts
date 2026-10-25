/**
 * 마스터 게임 — 조회·담기·검색·목록·수정·재동기화·삭제.
 *
 * 다른 도메인이 쓰는 것: `resolveGame`(담기), `findGame`·`requireGame`, `masterInfo`(상세), `searchGamesByName`(가져오기),
 * `findIgdbGameId`, `findGameByMediaFolder`·`uniqueMediaSlug`(스크린샷 폴더), `gameCollections`.
 *
 * ## 컬렉션 4종 (`game_developer`·`game_publisher`·`game_master_genre`·`game_release_platform`)
 *
 * 순서 컬럼이 없는 목록이라 바뀌면 **통째로 지우고 다시 넣는다.**
 * 컬렉션만 바뀌면 게임 행은 UPDATE하지 않는다(`updated_at` 그대로).
 */
import { and, asc, count, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, type Db } from "../../db/client";
import {
  acquisition, backlogDeveloperOverride, backlogEntry, backlogEntryGenre, backlogPublisherOverride,
  coverImage, game, gameDeveloper, gameMasterGenre, gamePublisher, gameReleasePlatform, playRecord, playthrough,
} from "../../db/schema";
import { InvalidInput, NotFound, isIntegrityViolation } from "../../common/errors";
import { normalize, normalizeAll, slug, sortKey } from "../../common/text";
import { amountJson, compareAmount, type Money } from "../../common/money";
import { nowKst } from "../../common/clock";
import { ldt, moneyJson, page, type Page } from "../../common/json";
import { igdbFindById, igdbSearch, type CatalogGameDetail } from "./igdb";

export type GameRow = typeof game.$inferSelect;
export const GAME_SOURCES = ["IGDB", "MANUAL"] as const;

const notFound = (gameId: number) => new NotFound(`게임을 찾을 수 없습니다. id=${gameId}`);

// ───────────── 조회 ─────────────

export async function findGame(d: Db, gameId: number): Promise<GameRow | undefined> {
  const [row] = await d.select().from(game).where(eq(game.id, gameId));
  return row;
}

/** 없으면 404 "게임을 찾을 수 없습니다. id=…" */
export async function requireGame(d: Db, gameId: number): Promise<GameRow> {
  const row = await findGame(d, gameId);
  if (!row) throw notFound(gameId);
  return row;
}

/** IGDB에서 가져온 게임이 이미 있나 */
export async function findIgdbGame(d: Db, externalId: string): Promise<GameRow | undefined> {
  const [row] = await d.select().from(game).where(and(eq(game.source, "IGDB"), eq(game.externalId, externalId)));
  return row;
}

export async function findIgdbGameId(d: Db, externalId: string): Promise<number | null> {
  return (await findIgdbGame(d, externalId))?.id ?? null;
}

/**
 * 이름 부분 일치 (가져오기가 쓴다). 이름순, 개수만 자른다.
 * ⚠️ `%`·`_`를 이스케이프하지 않는다 — 와일드카드로 먹는다 (그대로 둔 동작)
 */
export async function searchGamesByName(d: Db, keyword: string, limit: number): Promise<GameRow[]> {
  return d.select().from(game).where(nameLike(keyword)).orderBy(asc(game.name)).limit(limit);
}

const nameLike = (keyword: string) => sql`lower(${game.name}) like lower('%' || ${keyword} || '%')`;

/** 이 폴더 이름을 이미 쓰는 게임 */
export async function findGameByMediaFolder(d: Db, folder: string): Promise<GameRow | undefined> {
  const [row] = await d.select().from(game).where(eq(game.mediaFolder, folder));
  return row;
}

/**
 * 스크린샷 폴더 이름. **겹치면 게임 번호를 붙인다** —
 * 같은 이름의 게임이 실제로 둘 있을 수 있다(IGDB판 + 직접 등록판). 처음 차지한 쪽은 깨끗한 이름을 쓴다
 */
export async function uniqueMediaSlug(d: Db, g: Pick<GameRow, "id" | "name">): Promise<string> {
  const base = slug(g.name);
  // 번호 붙은 이름도 남이 쓰고 있을 수 있다 (게임 이름이 `foo-12`인 경우) — 비어 있을 때까지 올려 본다
  for (let n = 0; ; n++) {
    const candidate = mediaSlugCandidate(base, g.id, n);
    const owner = (await findGameByMediaFolder(d, candidate))?.id;
    if (owner === undefined || owner === g.id) return candidate;
  }
}

/** 같은 규칙, 조회 없이 — 여러 게임을 한 번에 볼 때 (`ownerOf`는 폴더 이름 → 칸 주인을 미리 모아 둔 쪽) */
export function mediaSlugGiven(g: Pick<GameRow, "id" | "name">, ownerOf: (folder: string) => number | undefined): string {
  const base = slug(g.name);
  for (let n = 0; ; n++) {
    const candidate = mediaSlugCandidate(base, g.id, n);
    const owner = ownerOf(candidate);
    if (owner === undefined || owner === g.id) return candidate;
  }
}

/** 0 = 깨끗한 이름, 1 = `이름-번호`(처음 정한 규칙 그대로), 2부터는 그것마저 겹칠 때 */
const mediaSlugCandidate = (base: string, id: number, n: number) =>
  n === 0 ? base : n === 1 ? `${base}-${id}` : `${base}-${id}-${n}`;

/**
 * 폴더를 정한다. **한 번 정하면 안 바꾼다** — 이미 있으면 그 값을 돌려준다.
 * 비어 있을 때만 UPDATE (값이 바뀌므로 `updated_at`도 바뀐다)
 */
export async function assignMediaFolder(d: Db, g: Pick<GameRow, "id" | "mediaFolder">, folder: string): Promise<string> {
  if (g.mediaFolder !== null) return g.mediaFolder;
  await d.update(game).set({ mediaFolder: folder, updatedAt: nowKst() }).where(eq(game.id, g.id));
  return folder;
}

export interface GameCollections { developers: string[]; publishers: string[]; masterGenres: string[]; releasePlatforms: string[] }

/**
 * 컬렉션 4종을 게임 여러 개에 한 번에. 순서는 **넣은 순서**(물리 순서)다 — 정렬 보장은 없지만
 * 같은 DB·같은 쿼리면 같은 순서가 나온다
 */
export async function gameCollections(d: Db, gameIds: number[]): Promise<Map<number, GameCollections>> {
  const out = new Map<number, GameCollections>();
  for (const id of gameIds) out.set(id, { developers: [], publishers: [], masterGenres: [], releasePlatforms: [] });
  if (gameIds.length === 0) return out;
  const push = (id: number, k: keyof GameCollections, v: string | null) => { if (v !== null) out.get(id)?.[k].push(v); };
  for (const r of await d.select().from(gameDeveloper).where(inArray(gameDeveloper.gameId, gameIds))) push(r.gameId, "developers", r.developer);
  for (const r of await d.select().from(gamePublisher).where(inArray(gamePublisher.gameId, gameIds))) push(r.gameId, "publishers", r.publisher);
  for (const r of await d.select().from(gameMasterGenre).where(inArray(gameMasterGenre.gameId, gameIds))) push(r.gameId, "masterGenres", r.genre);
  for (const r of await d.select().from(gameReleasePlatform).where(inArray(gameReleasePlatform.gameId, gameIds))) push(r.gameId, "releasePlatforms", r.platformName);
  return out;
}

/**
 * 마스터 정보 한 벌 (`MasterInfo`) — 백로그 상세의 `master`와 마스터 정보 수정 팝업(`GET /api/games/{id}`)이
 * 같은 모양을 쓴다. 한 곳에서 만들어야 둘이 어긋나지 않는다
 */
export async function masterInfo(d: Db, gameId: number) {
  const g = await requireGame(d, gameId);
  const c = (await gameCollections(d, [g.id])).get(g.id)!;
  return {
    gameId: g.id,
    name: g.name,
    developers: c.developers,
    publishers: c.publishers,
    releasedOn: g.releasedOn,
    listPrice: moneyJson(g.listPriceAmount, g.listPriceCurrency),
    genres: c.masterGenres,
    source: g.source,
    coverImageId: g.coverImageId,
    bannerImageId: g.bannerImageId,
    summary: g.summary,
    summaryKo: g.summaryKo,
    storyline: g.storyline,
    storylineKo: g.storylineKo,
    igdbRating: amountJson(g.igdbRating),
    igdbRatingCount: g.igdbRatingCount,
    releasePlatforms: c.releasePlatforms,
    mainStoryHours: g.mainStoryHours,
    mainExtraHours: g.mainExtraHours,
    completionistHours: g.completionistHours,
    timeToBeatSamples: g.timeToBeatSamples,
  };
}

// ───────────── 쓰기 조각 ─────────────

const COLLECTIONS = {
  developers: { table: gameDeveloper, col: "developer" },
  publishers: { table: gamePublisher, col: "publisher" },
  masterGenres: { table: gameMasterGenre, col: "genre" },
  releasePlatforms: { table: gameReleasePlatform, col: "platformName" },
} as const;

/** 정규화(strip, 빈 값 제거) 후 통째로 갈아 넣는다 */
async function replaceCollection(d: Db, gameId: number, kind: keyof typeof COLLECTIONS, values: readonly (string | null)[] | null, fresh = false) {
  const list = normalizeAll(values);
  const { table, col } = COLLECTIONS[kind];
  if (!fresh) await d.delete(table).where(eq(table.gameId, gameId));
  if (list.length > 0) await d.insert(table).values(list.map((v) => ({ gameId, [col]: v })) as never);
}

type GameChanges = Partial<Omit<GameRow, "id" | "createdAt" | "updatedAt">>;

const NUMERIC_COLUMNS = new Set<keyof GameRow>(["listPriceAmount", "igdbRating"]);

/** 값이 실제로 바뀐 게 있을 때만 UPDATE하고 그때만 `updated_at`을 올린다. numeric은 값으로 비교한다 (자릿수만 다르면 안 바뀐 것) */
async function updateGameIfChanged(d: Db, before: GameRow, changes: GameChanges, now: string) {
  const dirty = (Object.keys(changes) as (keyof GameChanges)[]).some((k) => {
    const a = before[k], b = changes[k];
    if (a === null || b === null || a === undefined || b === undefined) return a !== b;
    if (NUMERIC_COLUMNS.has(k)) return compareAmount(String(a), String(b)) !== 0;
    return a !== b;
  });
  if (!dirty) return;
  await d.update(game).set({ ...changes, updatedAt: now }).where(eq(game.id, before.id));
}

/** 마스터 이름 전파 — 이름 오버라이드가 없는 항목만, 삭제된 것도 포함 */
async function propagateName(d: Db, gameId: number, name: string, now: string): Promise<number> {
  const r = await d.update(backlogEntry)
    .set({ displayName: name, displayNameSortKey: sortKey(name), updatedAt: now })
    .where(and(eq(backlogEntry.gameId, gameId), isNull(backlogEntry.nameOverride)))
    .returning({ id: backlogEntry.id });
  return r.length;
}

/** 출시일 전파 — 출시일 오버라이드가 없는 항목만, 삭제된 것도 포함 */
async function propagateReleasedOn(d: Db, gameId: number, releasedOn: string | null, now: string): Promise<number> {
  const r = await d.update(backlogEntry)
    .set({ releasedOnResolved: releasedOn, updatedAt: now })
    .where(and(eq(backlogEntry.gameId, gameId), isNull(backlogEntry.releasedOnOverride)))
    .returning({ id: backlogEntry.id });
  return r.length;
}

/** 정규화해서 비면 400 */
function normalizedName(name: string | null): string {
  const n = normalize(name);
  if (n === null) throw new InvalidInput("게임 이름은 비울 수 없습니다");
  return n;
}

/** IGDB 상세를 게임 행 값으로 옮긴다 (컬렉션 제외). ⚠️ 원문(소개문·스토리라인)이 바뀌면 번역을 버린다 — 옛 번역이 새 원문인 척하면 안 된다 */
function catalogScalars(before: Pick<GameRow, "summary" | "storyline"> | null, detail: CatalogGameDetail, now: string): GameChanges {
  const changed = before === null || before.summary !== detail.summary || before.storyline !== detail.storyline;
  return {
    releasedOn: detail.releasedOn,
    coverImageId: detail.coverImageId,
    bannerImageId: detail.bannerImageId,
    ...(changed ? { summaryKo: null, storylineKo: null, summaryTranslatedAt: null } : {}),
    summary: detail.summary,
    storyline: detail.storyline,
    igdbRating: detail.igdbRating,
    igdbRatingCount: detail.igdbRatingCount,
    mainStoryHours: detail.mainStoryHours,
    mainExtraHours: detail.mainExtraHours,
    completionistHours: detail.completionistHours,
    timeToBeatSamples: detail.timeToBeatSamples,
    lastSyncedAt: now,
  };
}

async function syncCatalogCollections(d: Db, gameId: number, detail: CatalogGameDetail, fresh: boolean) {
  await replaceCollection(d, gameId, "developers", detail.developers, fresh);
  await replaceCollection(d, gameId, "publishers", detail.publishers, fresh);
  await replaceCollection(d, gameId, "masterGenres", detail.genres, fresh);
  await replaceCollection(d, gameId, "releasePlatforms", detail.releasePlatforms, fresh);
}

// ───────────── 담기 ─────────────

/**
 * IGDB 상세를 마스터로 저장. 이름은 **정규화하지 않고** 그대로 넣는다
 * (정규화는 이름 수정·재동기화 경로만)
 */
async function saveCatalogGame(d: Db, detail: CatalogGameDetail): Promise<number> {
  return d.transaction(async (tx) => {
    const now = nowKst();
    const [row] = await tx.insert(game).values({
      name: detail.name as string, source: "IGDB", externalId: detail.externalId,
      ...catalogScalars(null, detail, now),
      createdAt: now, updatedAt: now,
    }).returning({ id: game.id });
    await syncCatalogCollections(tx, row!.id, detail, true);
    return row!.id;
  });
}

/**
 * "이 요청이 가리키는 마스터 게임의 id".
 *
 *   gameId가 왔다            → 그대로. 존재 확인은 부르는 쪽(담기)이 어차피 한다
 *   externalId가 캐시됨      → 캐시된 id. 외부 호출 0회
 *   externalId가 없음        → IGDB 상세 1회 → 저장 → 그 id
 *
 * ⚠️ **`d`에 트랜잭션을 넘기지 말 것** — 가운데에 IGDB 호출이 있다.
 * 저장만 짧은 트랜잭션으로 열고, 담기 트랜잭션은 이게 끝난 **뒤에** 연다.
 * (IGDB 호출 기록 `recordApiCall`이 `db()`로 따로 쓰므로, 트랜잭션 안에서 부르면 PGlite에서 교착한다)
 *
 * 캐시는 **IGDB가 쓰는 모양**(`canonicalExternalId` — `040477`·`+40477`도 `40477`)으로 찾고, 상세를 받은 뒤엔
 * IGDB가 돌려준 id로 한 번 더 찾는다 — 저장은 그 id로 하므로, 찾는 열쇠가 달랐던 예전엔 이미 담긴 게임을
 * 다시 담으려다 409가 났다 (고친 버그 12, `docs/v2-plan.md`).
 * 유니크 충돌(동시에 같은 새 게임을 담음)이면 상대가 넣은 행을 그대로 쓴다. 다시 찾아도 없으면 원래 예외(→ 409)
 */
export async function resolveGame(d: Db, gameId: number | null, externalId: string | null): Promise<number> {
  if (gameId !== null) return gameId;
  const normalized = normalize(externalId);
  if (normalized === null) throw new InvalidInput("gameId 또는 externalId 중 하나는 필요합니다");

  const cached = await findIgdbGameId(d, canonicalExternalId(normalized));
  if (cached !== null) return cached;

  const detail = await igdbFindById(normalized);
  const saved = await findIgdbGameId(d, detail.externalId);
  if (saved !== null) return saved;
  try {
    return await saveCatalogGame(d, detail);
  } catch (e) {
    if (!isIntegrityViolation(e)) throw e;
    console.log(`동시 캐시 저장 충돌 — 이미 저장된 마스터를 재사용합니다. externalId=${detail.externalId}`);
    const again = await findIgdbGameId(d, detail.externalId);
    if (again === null) throw e;
    return again;
  }
}

/** 정수면 IGDB가 돌려주는 모양(앞의 0·`+` 없음)으로. 정수가 아니면 그대로 — 상세 조회가 404로 끊는다 */
export function canonicalExternalId(id: string): string {
  return /^[+-]?\d+$/.test(id) ? BigInt(id).toString() : id;
}

// ───────────── 검색 ─────────────

export interface GameSearchResponse {
  gameId: number | null; externalId: string | null; name: string | null;
  releasedOn: string | null; source: string; coverImageId: string | null;
}

export const searchResponse = (g: GameRow): GameSearchResponse => ({
  gameId: g.id, externalId: g.externalId, name: g.name, releasedOn: g.releasedOn, source: g.source, coverImageId: g.coverImageId,
});

const MANUAL_LIMIT = 10;

/**
 * 로컬 수동 등록 게임 + IGDB 결과를 이어 붙인다. **IGDB가 죽으면 502로 끝난다** — 로컬 결과만
 * 조용히 주면 사용자는 "IGDB에 없는 게임"으로 오해하고 수동 등록으로 가버린다 (J-6).
 * 마스터에 이미 있는 IGDB 게임은 마스터 값이 이긴다 (고친 이름·출시일이 원본으로 돌아가면 안 된다)
 */
export async function searchGames(keyword: string | null): Promise<GameSearchResponse[]> {
  const normalized = normalize(keyword);
  if (normalized === null) return [];
  const d = db();
  const manual = await d.select().from(game)
    .where(and(eq(game.source, "MANUAL"), nameLike(normalized))).orderBy(asc(game.name)).limit(MANUAL_LIMIT);

  const remote = await igdbSearch(normalized);
  const ids = remote.map((r) => r.externalId);
  const cached = new Map<string, GameRow>();
  if (ids.length > 0) {
    for (const g of await d.select().from(game).where(and(eq(game.source, "IGDB"), inArray(game.externalId, ids)))) {
      if (g.externalId !== null && !cached.has(g.externalId)) cached.set(g.externalId, g);
    }
  }
  return [
    ...manual.map(searchResponse),
    ...remote.map((r) => {
      const g = cached.get(r.externalId);
      return g ? searchResponse(g)
        : { gameId: null, externalId: r.externalId, name: r.name, releasedOn: r.releasedOn, source: "IGDB", coverImageId: r.coverImageId };
    }),
  ];
}

// ───────────── 마스터 목록 ─────────────

export interface GameMasterResponse {
  gameId: number; name: string; source: string; externalId: string | null;
  releasedOn: string | null; coverImageId: string | null; lastSyncedAt: string | null;
}

const masterResponse = (g: GameRow): GameMasterResponse => ({
  gameId: g.id, name: g.name, source: g.source, externalId: g.externalId,
  releasedOn: g.releasedOn, coverImageId: g.coverImageId, lastSyncedAt: ldt(g.lastSyncedAt),
});

/** 상한은 서버가 정한다 */
const MAX_SIZE = 100;

/** 검색어가 없으면 전체를 이름순으로. 빈 검색어는 `''`로 — 전부 걸린다 */
export async function masterPage(keyword: string | null, pageNo: number, size: number): Promise<Page<GameMasterResponse>> {
  const k = normalize(keyword) ?? "";
  const p = Math.max(pageNo, 0);
  const s = Math.min(Math.max(size, 1), MAX_SIZE);
  const d = db();
  const items = await d.select().from(game).where(nameLike(k)).orderBy(asc(game.name)).limit(s).offset(p * s);
  const [total] = await d.select({ n: count() }).from(game).where(nameLike(k));
  return page(items.map(masterResponse), p, s, Number(total!.n));
}

/** KST 벽시계에서 N달 빼기 — 말일을 넘으면 그 달 말일로 (3월 31일 − 1달 = 2월 말일) */
function minusMonthsKst(months: number, now = nowKst()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(now)!;
  let y = +m[1]!, mo = +m[2]! - months;
  while (mo < 1) { mo += 12; y--; }
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const day = Math.min(+m[3]!, last);
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}${m[4]}`;
}

/**
 * 일괄 동기화 대상 — 3개월 지난(또는 한 번도 안 맞춘) IGDB 게임. 수동 등록은 원본이 없어 뺀다.
 * 진행 상태를 저장하지 않는다 — `last_synced_at`이 이미 상태다
 */
export async function outdatedGames(): Promise<GameMasterResponse[]> {
  const threshold = minusMonthsKst(3);
  const rows = await db().select().from(game)
    .where(and(eq(game.source, "IGDB"), or(isNull(game.lastSyncedAt), lt(game.lastSyncedAt, threshold))))
    .orderBy(asc(game.name));
  return rows.map(masterResponse);
}

// ───────────── 수정 ─────────────

export interface MasterInfo {
  developers: readonly (string | null)[] | null;
  publishers: readonly (string | null)[] | null;
  genres: readonly (string | null)[] | null;
  releasedOn: string | null;
  listPrice: Money | null;
}

/** 수동 등록 (FR-GAME-04). 이름 중복을 막지 않는다 — 같은 이름의 다른 게임(리메이크·지역판)이 실제로 있다 */
export async function registerManual(name: string | null, info: MasterInfo): Promise<number> {
  return db().transaction(async (tx) => {
    const n = normalizedName(name);
    const now = nowKst();
    const [row] = await tx.insert(game).values({
      name: n, source: "MANUAL", externalId: null,
      releasedOn: info.releasedOn,
      listPriceAmount: info.listPrice?.amount ?? null, listPriceCurrency: info.listPrice?.currency ?? null,
      createdAt: now, updatedAt: now,
    }).returning({ id: game.id });
    const id = row!.id;
    await replaceCollection(tx, id, "developers", info.developers, true);
    await replaceCollection(tx, id, "publishers", info.publishers, true);
    await replaceCollection(tx, id, "masterGenres", info.genres, true);
    return id;
  });
}

/** 마스터 이름 수정 + 전파 (FR-ADM-01). @returns displayName이 갱신된 항목 수 */
export async function updateGameName(gameId: number, newName: string | null): Promise<number> {
  return db().transaction(async (tx) => {
    const g = await requireGame(tx, gameId);
    const name = normalizedName(newName);
    const now = nowKst();
    await updateGameIfChanged(tx, g, { name }, now);
    return propagateName(tx, gameId, name, now);
  });
}

/**
 * 마스터 정보 수정 + 전파 (전체 교체). 출시일이 바뀌면 항목들의 정렬용 비정규화(`released_on_resolved`)도
 * 따라가야 한다 — 그게 이 함수가 따로 있는 이유다. @returns released_on_resolved가 갱신된 항목 수
 */
export async function syncMasterInfo(gameId: number, info: MasterInfo): Promise<number> {
  return db().transaction(async (tx) => {
    const g = await requireGame(tx, gameId);
    const now = nowKst();
    await replaceCollection(tx, gameId, "developers", info.developers);
    await replaceCollection(tx, gameId, "publishers", info.publishers);
    await replaceCollection(tx, gameId, "masterGenres", info.genres);
    await updateGameIfChanged(tx, g, {
      releasedOn: info.releasedOn,
      listPriceAmount: info.listPrice?.amount ?? null,
      listPriceCurrency: info.listPrice?.currency ?? null,
    }, now);
    return propagateReleasedOn(tx, gameId, info.releasedOn, now);
  });
}

export interface GameResyncResult { nameChanged: boolean; renamedEntries: number; reorderedEntries: number }

/**
 * 재동기화의 새 이름. **정규화한 뒤 비교한다** — 저장하는 값과 같은 모양으로 봐야 한다.
 * 원문으로 비교하던 때는 IGDB 이름 끝에 공백이 있으면 매번 "바뀜" + 전파였다 (고친 버그 11, `docs/v2-plan.md`).
 * IGDB가 이름을 안 주거나 공백뿐이면 지금 이름을 지킨다
 */
export function resyncedName(remote: string | null, current: string): { nameChanged: boolean; name: string } {
  const fresh = normalize(remote);
  return fresh !== null && fresh !== current ? { nameChanged: true, name: fresh } : { nameChanged: false, name: current };
}

/**
 * 외부 DB 재동기화 (FR-GAME-05).
 * IGDB 호출은 트랜잭션 밖에서(호출 기록이 따로 커밋되므로 안에서 부르면 PGlite 교착), 반영은 안에서. **정가는 안 건드린다** (IGDB는 가격을 안 준다).
 * 개인 오버라이드는 항목 쪽에 있어 자동으로 보존된다
 */
export async function resyncGame(gameId: number): Promise<GameResyncResult> {
  const g = await requireGame(db(), gameId);
  if (g.source !== "IGDB" || g.externalId === null) {
    // 조용히 넘어가면 "동기화됐다"로 읽힌다
    throw new InvalidInput(`외부 DB에서 가져온 게임만 재동기화할 수 있습니다. id=${gameId}`);
  }
  const detail = await igdbFindById(g.externalId);
  return db().transaction(async (tx) => {
    const cur = await requireGame(tx, gameId);
    const now = nowKst();
    const { nameChanged, name } = resyncedName(detail.name, cur.name);
    await syncCatalogCollections(tx, gameId, detail, false);
    await updateGameIfChanged(tx, cur, { ...(nameChanged ? { name } : {}), ...catalogScalars(cur, detail, now) }, now);
    const renamedEntries = nameChanged ? await propagateName(tx, gameId, name, now) : 0;
    const reorderedEntries = await propagateReleasedOn(tx, gameId, detail.releasedOn, now);
    return { nameChanged, renamedEntries, reorderedEntries };
  });
}

// ───────────── 삭제 ─────────────

/**
 * 마스터 완전 삭제 — 휴지통을 안 거친다(되살릴 마스터가 없어진다). 담긴 기록까지 함께 사라진다.
 *
 * **순서가 전부다.** 항목 ↔ 회차가 서로를 참조하므로(`last_playthrough_id`) 항목의 참조를 먼저 끊는다.
 * 항목 하위 테이블(개발사·퍼블리셔 오버라이드 등)과 게임의 컬렉션 4종을 FK 순서대로 먼저 비운다.
 * 커버 파일은 지우지 않는다 (스토리지·로컬 파일이 고아로 남는다)
 *
 * @returns 함께 사라진 항목 수 (휴지통에 있던 것 포함)
 */
export async function deleteGame(gameId: number): Promise<number> {
  return db().transaction(async (tx) => {
    await requireGame(tx, gameId);
    const [c] = await tx.select({ n: count() }).from(backlogEntry).where(eq(backlogEntry.gameId, gameId));
    const entries = Number(c!.n);

    await tx.update(backlogEntry).set({ lastPlaythroughId: null, updatedAt: nowKst() }).where(eq(backlogEntry.gameId, gameId));

    const entryIds = tx.select({ id: backlogEntry.id }).from(backlogEntry).where(eq(backlogEntry.gameId, gameId));
    await tx.delete(backlogEntryGenre).where(inArray(backlogEntryGenre.backlogEntryId, entryIds));
    await tx.delete(coverImage).where(inArray(coverImage.backlogEntryId, entryIds));
    await tx.delete(acquisition).where(inArray(acquisition.backlogEntryId, entryIds));
    await tx.delete(playthrough).where(inArray(playthrough.backlogEntryId, entryIds));
    // homeops 일정은 항목을 지우면 cascade로 같이 간다 — 여기서 그 표에 쓰지 않는다
    await tx.delete(playRecord).where(inArray(playRecord.backlogEntryId, entryIds));
    await tx.delete(backlogDeveloperOverride).where(inArray(backlogDeveloperOverride.backlogEntryId, entryIds));
    await tx.delete(backlogPublisherOverride).where(inArray(backlogPublisherOverride.backlogEntryId, entryIds));
    await tx.delete(backlogEntry).where(eq(backlogEntry.gameId, gameId));

    for (const { table } of Object.values(COLLECTIONS)) await tx.delete(table).where(eq(table.gameId, gameId));
    await tx.delete(game).where(eq(game.id, gameId));

    console.log(`마스터 게임 삭제. gameId=${gameId} 함께 사라진 항목=${entries}`);
    return entries;
  });
}
