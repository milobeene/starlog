/**
 * 백로그 도메인 공용 — 항목 찾기, 파생 상태 계산.
 */
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { acquisition, backlogEntry, playthrough } from "../../db/schema";
import { Conflict, NotFound } from "../../common/errors";
import { saveIfChanged } from "../../db/changes";

export const BACKLOG_STATUSES = ["WISHLIST", "BACKLOG", "PLAYING", "PAUSED", "DROPPED", "COMPLETED"] as const;
export const PLAYTHROUGH_STATUSES = ["PLAYING", "PAUSED", "DROPPED", "COMPLETED"] as const;
export const ACQUISITION_METHODS = ["PURCHASED", "SUBSCRIPTION", "FREE", "GIFT", "BORROWED", "DEMO", "NOT_OWNED"] as const;

export type BacklogStatus = (typeof BACKLOG_STATUSES)[number];
export type PlaythroughStatus = (typeof PLAYTHROUGH_STATUSES)[number];
export type EntryRow = typeof backlogEntry.$inferSelect;
export type PlaythroughRow = typeof playthrough.$inferSelect;

const notFound = (entryId: number) => new NotFound(`백로그 항목을 찾을 수 없습니다. id=${entryId}`);

// ───────────── 항목 찾기 ─────────────

/** 삭제된 것 포함 */
export async function findEntryIncludingDeleted(d: Db, entryId: number): Promise<EntryRow> {
  const [row] = await d.select().from(backlogEntry).where(eq(backlogEntry.id, entryId));
  if (!row) throw notFound(entryId);
  return row;
}

/** 살아있는 항목만. 수정 경로는 전부 이걸 쓴다 */
export async function findAliveEntry(d: Db, entryId: number): Promise<EntryRow> {
  const row = await findEntryIncludingDeleted(d, entryId);
  if (row.deletedAt !== null) throw new Conflict(`삭제된 항목입니다. id=${entryId}`);
  return row;
}

/**
 * 항목 행을 잠그고 나서 `findAliveEntry`. 형제 회차 검증(BR-PT-02·03)을 직렬화하려는 잠금이다.
 * PGlite는 세션이 하나라 원래 직렬이지만, 클라우드(Postgres)에서는 필요하다
 */
export async function findAliveEntryForUpdate(d: Db, entryId: number): Promise<EntryRow> {
  const [locked] = await d.select({ id: backlogEntry.id }).from(backlogEntry)
    .where(eq(backlogEntry.id, entryId)).for("update");
  if (!locked) throw notFound(entryId);
  return findAliveEntry(d, entryId);
}

/** 상세용 — 삭제된 항목은 조건에서 걸러져 404 (findAliveEntry의 409와 의도적으로 다르다) */
export async function findAliveEntry404(d: Db, entryId: number): Promise<EntryRow> {
  const [row] = await d.select().from(backlogEntry).where(eq(backlogEntry.id, entryId));
  if (!row || row.deletedAt !== null) throw notFound(entryId);
  return row;
}

// ───────────── 파생 상태 (§7.6) ─────────────

type PtLike = Pick<PlaythroughRow, "id" | "sequenceNo" | "startedOn" | "finishedOn" | "status">;

export const lastActivityOn = (p: Pick<PtLike, "startedOn" | "finishedOn">) => p.finishedOn ?? p.startedOn;

/**
 * 최신 회차 = COALESCE(종료일, 시작일) 최대 — 번호가 아니라 날짜가 정한다.
 * 같은 날이면 **진행 중인 것 → 시작일이 늦은 것 → 번호 큰 쪽**. 같은 날 맞닿는 회차(BR-PT-02, 2026-10-25)가 생긴 뒤로
 * "D에 끝난 회차"와 "D에 시작한 회차"가 같은 날로 겹친다 — 뒤의 것이 늦게 시작했으니 최신이다 (번호는 나중에 적은 과거 회차가 더 클 수 있다).
 * 그 전엔 이런 동점이 생길 수 없어서 기존 데이터의 판정은 그대로다.
 * 회차가 없으면 **취득이 하나라도 있으면 BACKLOG**, 없으면 WISHLIST
 */
function newer(p: PtLike, q: PtLike): boolean {
  const a = lastActivityOn(p), b = lastActivityOn(q);
  if (a !== b) return a > b;
  if ((p.finishedOn === null) !== (q.finishedOn === null)) return p.finishedOn === null;
  if (p.startedOn !== q.startedOn) return p.startedOn > q.startedOn;
  return p.sequenceNo > q.sequenceNo;
}

export function deriveState(pts: readonly PtLike[], hasAcquisition: boolean) {
  let latest: PtLike | null = null;
  for (const p of pts) {
    if (latest === null || newer(p, latest)) latest = p;
  }
  if (latest !== null) {
    return { status: latest.status, lastPlayedOn: lastActivityOn(latest), lastPlaythroughId: latest.id };
  }
  return { status: hasAcquisition ? "BACKLOG" : "WISHLIST", lastPlayedOn: null, lastPlaythroughId: null };
}

export async function playthroughsOf(d: Db, entryId: number): Promise<PlaythroughRow[]> {
  return d.select().from(playthrough).where(eq(playthrough.backlogEntryId, entryId)).orderBy(asc(playthrough.sequenceNo));
}

export async function acquisitionCount(d: Db, entryId: number): Promise<number> {
  const [r] = await d.select({ n: sql<number>`count(*)::int` }).from(acquisition).where(eq(acquisition.backlogEntryId, entryId));
  return r?.n ?? 0;
}

const ENTRY_NUMERIC = ["rating", "playTimeHours", "listPriceOverrideAmount"] as const;

export function saveEntryIfChanged(d: Db, before: EntryRow, after: Partial<EntryRow>) {
  return saveIfChanged(d, before, after, (patch) =>
    d.update(backlogEntry).set(patch).where(eq(backlogEntry.id, before.id)), ENTRY_NUMERIC);
}

