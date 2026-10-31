/**
 * 스팀 앱 ↔ STARLOG 항목 연결 (`steam_app_link`, V21).
 *
 * 규칙
 *   - **MANUAL은 절대 안 덮는다.** AUTO/NONE을 쓰는 UPSERT는 `where source <> 'MANUAL'`을 달고 있다 —
 *     IGDB를 기다리는 사이 사용자가 PUT으로 고른 것을 늦게 온 자동 결과가 밟으면 안 된다.
 *   - IGDB는 **트랜잭션 밖에서** 한 번에 묶어 부른다. 여기엔 트랜잭션이 아예 없다 (단일 사용자라 UPSERT 한 줄씩이면 충분)
 *   - IGDB가 없거나 실패하면 캐시만으로 답한다. 요청 전체를 실패시키지 않는다
 *   - 게임을 찾았는데 내 항목에 없으면 NONE + `igdb_game_id`로 남긴다 — 그 행은 IGDB를 다시 안 부르고
 *     **로컬에서만** 다시 맞춘다(나중에 담으면 바로 붙는다). IGDB에 아예 없던 NONE만 7일 뒤 다시 묻는다
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { backlogEntry, game, steamAppLink } from "../../db/schema";
import { nowKst } from "../../common/clock";
import { InvalidInput, NotFound } from "../../common/errors";
import { igdbSteamGames } from "../game/igdb";
import { igdbCredentialsPresent, igdbCredentials } from "../system/service";

export type LinkSource = "AUTO" | "MANUAL" | "NONE";
export interface SteamLink { appid: string; entryId: number | null; entryName: string | null; source: LinkSource | null }

/** 한 번에 받는 상한 (계약) */
export const MAX_APPIDS = 200;
/** IGDB에 아예 없던 앱을 다시 묻기까지 */
export const NONE_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
/** 스팀 앱 번호는 32비트. 이보다 크면 비스팀 바로가기라 IGDB에 안 묻는다 */
const MAX_STEAM_APPID = 4_294_967_295n;

const APPID = /^[1-9][0-9]{0,19}$/;
export const isValidAppid = (s: string) => APPID.test(s);
export const isSteamRange = (s: string) => isValidAppid(s) && BigInt(s) <= MAX_STEAM_APPID;

export function requireAppid(s: string): string {
  if (!isValidAppid(s)) throw new InvalidInput(`appid는 숫자만 받습니다: ${s.slice(0, 30)}`);
  return s;
}

/** 요청 목록 검증 + 중복 제거(순서 유지) */
export function checkAppids(raw: string[]): string[] {
  if (raw.length > MAX_APPIDS) throw new InvalidInput(`appids는 ${MAX_APPIDS}개까지입니다`);
  return [...new Set(raw.map(requireAppid))];
}

export interface ResolveDeps {
  /** IGDB 조회 (테스트가 갈아 끼운다). 키가 없으면 null 대신 `unavailable`을 던지는 대신 이 함수를 아예 안 부른다 */
  lookup: (uids: string[]) => Promise<Map<string, string>>;
  /** 키가 있나 */
  available: () => Promise<boolean>;
  /** 앱 시계 */
  now: () => Date;
}

const defaultDeps: ResolveDeps = {
  lookup: igdbSteamGames,
  available: async () => igdbCredentialsPresent(await igdbCredentials()),
  now: () => new Date(),
};

type Row = typeof steamAppLink.$inferSelect;
interface LiveEntry { id: number; name: string }

const view = (appid: string, row: Row | undefined, live: Map<number, LiveEntry>): SteamLink => {
  if (!row) return { appid, entryId: null, entryName: null, source: null };
  const e = row.backlogEntryId === null ? undefined : live.get(row.backlogEntryId);
  // 끊긴 MANUAL(항목이 지워짐)은 연결 없음으로 답한다 — 행은 남겨 둬서 항목이 되살아나면 다시 붙는다
  if (row.source === "MANUAL") return e ? { appid, entryId: e.id, entryName: e.name, source: "MANUAL" } : { appid, entryId: null, entryName: null, source: null };
  if (row.source === "AUTO") return e ? { appid, entryId: e.id, entryName: e.name, source: "AUTO" } : { appid, entryId: null, entryName: null, source: null };
  return { appid, entryId: null, entryName: null, source: "NONE" };
};

async function liveEntries(d: Db, ids: number[]): Promise<Map<number, LiveEntry>> {
  const out = new Map<number, LiveEntry>();
  if (ids.length === 0) return out;
  const rows = await d.select({ id: backlogEntry.id, name: backlogEntry.displayName }).from(backlogEntry)
    .where(and(inArray(backlogEntry.id, ids), isNull(backlogEntry.deletedAt)));
  for (const r of rows) out.set(r.id, r);
  return out;
}

/** IGDB 게임 id들 → 살아 있는 항목 (game.source=IGDB, external_id). 항목은 게임당 하나(uk) */
async function entriesOfIgdbGames(d: Db, igdbIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (igdbIds.length === 0) return out;
  const rows = await d.select({ ext: game.externalId, id: backlogEntry.id }).from(game)
    .innerJoin(backlogEntry, eq(backlogEntry.gameId, game.id))
    .where(and(eq(game.source, "IGDB"), inArray(game.externalId, igdbIds), isNull(backlogEntry.deletedAt)));
  for (const r of rows) if (r.ext !== null) out.set(r.ext, r.id);
  return out;
}

/** AUTO/NONE 쓰기. MANUAL 행은 건드리지 않는다 (where) */
async function writeAuto(d: Db, appid: string, entryId: number | null, igdbId: string | null, source: "AUTO" | "NONE", now: string) {
  const values = {
    appid, backlogEntryId: entryId, igdbGameId: igdbId === null ? null : Number(igdbId), source,
    checkedAt: now, createdAt: now, updatedAt: now,
  };
  await d.insert(steamAppLink).values(values).onConflictDoUpdate({
    target: steamAppLink.appid,
    set: { backlogEntryId: values.backlogEntryId, igdbGameId: values.igdbGameId, source, checkedAt: now, updatedAt: now },
    setWhere: sql`${steamAppLink.source} <> 'MANUAL'`,
  });
}

export async function resolveLinks(d: Db, appids: string[], deps: ResolveDeps = defaultDeps): Promise<SteamLink[]> {
  if (appids.length === 0) return [];
  const nowDate = deps.now();
  const now = nowKst(nowDate);
  const staleBefore = nowKst(new Date(nowDate.getTime() - NONE_RECHECK_MS));

  let rows = new Map((await d.select().from(steamAppLink).where(inArray(steamAppLink.appid, appids))).map((r) => [r.appid, r]));
  let live = await liveEntries(d, [...rows.values()].flatMap((r) => (r.backlogEntryId === null ? [] : [r.backlogEntryId])));

  // 1) 로컬 다시 맞추기 — 이미 IGDB 게임을 아는 AUTO/NONE 행. 항목이 지워졌거나(AUTO) 나중에 담긴(NONE) 경우가 여기서 풀린다
  const rematch = [...rows.values()].filter((r) => r.source !== "MANUAL" && r.igdbGameId !== null
    && (r.backlogEntryId === null || !live.has(r.backlogEntryId)));
  if (rematch.length > 0) {
    const byGame = await entriesOfIgdbGames(d, rematch.map((r) => String(r.igdbGameId)));
    for (const r of rematch) {
      const eid = byGame.get(String(r.igdbGameId)) ?? null;
      const wantSource = eid === null ? "NONE" : "AUTO";
      if (eid === r.backlogEntryId && wantSource === r.source) continue;
      await writeAuto(d, r.appid, eid, String(r.igdbGameId), wantSource, now);
    }
  }

  // 2) IGDB에 물을 것 — 행이 없거나, IGDB에 없던 NONE이 7일 지났거나, IGDB 게임도 모르는데 항목이 사라진 AUTO(이전 판 호환)
  const ask = appids.filter((a) => {
    if (!isSteamRange(a)) return false;
    const r = rows.get(a);
    if (!r) return true;
    if (r.source === "MANUAL") return false;
    if (r.igdbGameId !== null) return false;
    if (r.source === "NONE") return r.checkedAt === null || r.checkedAt < staleBefore;
    return r.backlogEntryId === null || !live.has(r.backlogEntryId);
  });
  if (ask.length > 0 && await deps.available()) {
    let found: Map<string, string> | null = null;
    try {
      // 500건 상한이 있지만 요청이 200개라 한 번이다. **트랜잭션 밖**
      found = await deps.lookup(ask);
    } catch (e) {
      console.warn("스팀 연결 — IGDB 조회 실패, 캐시만으로 답한다", e instanceof Error ? e.message : e);
    }
    if (found !== null) {
      const byGame = await entriesOfIgdbGames(d, [...new Set(found.values())]);
      for (const a of ask) {
        const igdbId = found.get(a) ?? null;
        if (igdbId === null) { await writeAuto(d, a, null, null, "NONE", now); continue; }
        const eid = byGame.get(igdbId) ?? null;
        await writeAuto(d, a, eid, igdbId, eid === null ? "NONE" : "AUTO", now);
      }
    }
  }

  // 쓰고 난 뒤 한 번 더 읽는다 — MANUAL 보호(where)로 안 써진 행도 실제 값으로 답하려고
  rows = new Map((await d.select().from(steamAppLink).where(inArray(steamAppLink.appid, appids))).map((r) => [r.appid, r]));
  live = await liveEntries(d, [...rows.values()].flatMap((r) => (r.backlogEntryId === null ? [] : [r.backlogEntryId])));
  return appids.map((a) => view(a, rows.get(a), live));
}

/** 직접 연결. 없는(또는 휴지통의) 항목은 404 */
export async function setManualLink(d: Db, appid: string, entryId: number, now: Date = new Date()): Promise<SteamLink> {
  const [e] = await d.select({ id: backlogEntry.id, name: backlogEntry.displayName }).from(backlogEntry)
    .where(and(eq(backlogEntry.id, entryId), isNull(backlogEntry.deletedAt)));
  if (!e) throw new NotFound(`항목을 찾을 수 없습니다. id=${entryId}`);
  const t = nowKst(now);
  await d.insert(steamAppLink).values({
    appid, backlogEntryId: e.id, igdbGameId: null, source: "MANUAL", checkedAt: null, createdAt: t, updatedAt: t,
  }).onConflictDoUpdate({
    target: steamAppLink.appid,
    set: { backlogEntryId: e.id, igdbGameId: null, source: "MANUAL", checkedAt: null, updatedAt: t },
  });
  return { appid, entryId: e.id, entryName: e.name, source: "MANUAL" };
}

/** 연결 지우기. 없어도 조용히 — 다음 resolve가 다시 자동으로 맞출 수 있다 */
export async function removeLink(d: Db, appid: string): Promise<void> {
  await d.delete(steamAppLink).where(eq(steamAppLink.appid, appid));
}

/** 백업용 — 직접 고른 것만 (AUTO/NONE은 캐시라 다시 만들어진다). 항목 번호 → appid 목록 */
export async function manualAppidsByEntry(d: Db): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  const rows = await d.select().from(steamAppLink).where(eq(steamAppLink.source, "MANUAL")).orderBy(steamAppLink.appid);
  for (const r of rows) {
    if (r.backlogEntryId === null) continue;
    const l = out.get(r.backlogEntryId) ?? [];
    l.push(r.appid);
    out.set(r.backlogEntryId, l);
  }
  return out;
}

/** 가져오기용 — 모양이 틀린 번호는 조용히 버린다(백업 전체를 막을 일이 아니다). 이미 있으면 파일 쪽이 이긴다 */
export async function importManualLinks(d: Db, entryId: number, appids: (string | null)[] | null, now: string): Promise<number> {
  let n = 0;
  for (const a of appids ?? []) {
    if (a === null || !isValidAppid(a)) continue;
    await d.insert(steamAppLink).values({
      appid: a, backlogEntryId: entryId, igdbGameId: null, source: "MANUAL", checkedAt: null, createdAt: now, updatedAt: now,
    }).onConflictDoUpdate({
      target: steamAppLink.appid,
      set: { backlogEntryId: entryId, igdbGameId: null, source: "MANUAL", checkedAt: null, updatedAt: now },
    });
    n++;
  }
  return n;
}

/** 덮어쓰기 전 정리 — 항목이 다 지워지므로 연결도 같이 (끊긴 MANUAL을 남기지 않는다) */
export async function wipeLinks(d: Db): Promise<void> {
  await d.delete(steamAppLink);
}
