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
 * 최신 회차 = COALESCE(종료일, 시작일) 최대, 같으면 번호 큰 쪽 — 번호가 아니라 날짜가 정한다.
 * 회차가 없으면 **취득이 하나라도 있으면 BACKLOG**, 없으면 WISHLIST
 */
export function deriveState(pts: readonly PtLike[], hasAcquisition: boolean) {
  let latest: PtLike | null = null;
  for (const p of pts) {
    if (latest === null) { latest = p; continue; }
    const a = lastActivityOn(p), b = lastActivityOn(latest);
    if (a > b || (a === b && p.sequenceNo > latest.sequenceNo)) latest = p;
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

export function saveEntryIfChanged(d: Db, before: EntryRow, after: Partial<EntryRow>) {
  return saveIfChanged(d, before, after, (patch) =>
    d.update(backlogEntry).set(patch).where(eq(backlogEntry.id, before.id)));
}

