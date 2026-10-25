/**
 * 플레이타임 기록 (v2 S4). **기록이 원본이고 `backlog_entry.play_time_hours`는 합계 캐시다.**
 *
 *   합계 = STARLOG 기록(`play_record`)의 합 + **끝난** homeops 일정(`homeops_play_log`)의 합
 *
 * 합계를 계산하는 건 STARLOG뿐이다 — 기록이 바뀔 때마다, 그리고 기동 때 한 번(앱이 꺼진 동안
 * homeops가 썼을 수 있다). 기록이 하나도 없으면 null("안 적음"), 0분짜리라도 있으면 0.
 *
 * 단위는 분이고 소수 첫째 자리까지다(V15 머리말). 계산은 **0.1분 단위 정수(BigInt)** 로만 한다.
 */
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { db, type Db } from "../../db/client";
import { backlogEntry, homeopsPlayLog, playRecord } from "../../db/schema";
import { InvalidInput, NotFound } from "../../common/errors";
import { nowKst, todayKst } from "../../common/clock";
import { ldt, page as pageOf } from "../../common/json";
import { setScale } from "../../common/money";
import { normalize } from "../../common/text";
import { saveIfChanged } from "../../db/changes";
import { one, rows } from "../../db/raw";
import { normalizePage, normalizeSize } from "./query";
import { findAliveEntry404, findAliveEntryForUpdate, saveEntryIfChanged, type EntryRow } from "./shared";

export const PLAY_RECORD_KINDS = ["BASELINE", "ADJUST", "ADD"] as const;
export type PlayRecordKind = (typeof PLAY_RECORD_KINDS)[number];

/** 99999.99시간 — `play_time_hours numeric(7,2)`의 상한을 0.1분으로 */
const MAX_TENTHS = 99_999_99n * 6n;

// ───────────── 단위 (0.1분 정수) ─────────────

/** `"142.8"` → 1428n. 둘째 자리부터는 HALF_UP */
export const tenthsOf = (minutes: string) => BigInt(setScale(minutes, 1).replace(".", ""));

export function minutesText(tenths: bigint): string {
  const neg = tenths < 0n;
  const abs = neg ? -tenths : tenths;
  return `${neg ? "-" : ""}${abs / 10n}.${abs % 10n}`;
}

/** 소수 둘째 자리 시간 → 0.1분 — 0.01시간이 정확히 0.6분이라 손실이 없다 */
export const tenthsFromHours = (hours: string) => BigInt(setScale(hours, 2).replace(".", "")) * 6n;

/** 0.1분 → 시간 소수 둘째 자리, HALF_UP. 음수는 0으로(아래 `totalOf`) 걸러진 뒤에만 온다 */
export function hoursText(tenths: bigint): string {
  const cents = (tenths + 3n) / 6n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** 오류 메시지용 — `4시간 30분`, `-30분`. 화면 `formatPlayTime`과 같은 꼴(분은 반올림) */
function durationText(tenths: bigint): string {
  const neg = tenths < 0n;
  const m = ((neg ? -tenths : tenths) + 5n) / 10n;
  const h = m / 60n, r = m % 60n;
  const body = h === 0n ? `${r}분` : r === 0n ? `${h}시간` : `${h}시간 ${r}분`;
  return (neg ? "-" : "") + body;
}

// ───────────── 합계 ─────────────

interface Sums { tenths: bigint; rows: number }

/**
 * 항목별 합. `entryId`가 없으면 전부 (기동 때 재계산). 합은 글자로 받는다 — 정수 칸의 sum은 int8이라 드라이버가 숫자로 바꾼다. homeops는 `ended_at ≤ 지금`만 —
 * 시각은 앱 시계로 넘긴다(DB `now()`는 세션 시간대를 탄다)
 */
async function sumsByEntry(d: Db, now: string, entryId?: number): Promise<Map<number, Sums>> {
  const starlog = await d.select({
    id: playRecord.backlogEntryId, m: sql<string>`sum(${playRecord.minutes})::text`, n: sql<number>`count(*)::int`,
  }).from(playRecord)
    .where(entryId === undefined ? undefined : eq(playRecord.backlogEntryId, entryId))
    .groupBy(playRecord.backlogEntryId);
  const homeops = await d.select({
    id: homeopsPlayLog.backlogEntryId, m: sql<string>`sum(${homeopsPlayLog.minutes})::text`, n: sql<number>`count(*)::int`,
  }).from(homeopsPlayLog)
    .where(and(lte(homeopsPlayLog.endedAt, now), entryId === undefined ? undefined : eq(homeopsPlayLog.backlogEntryId, entryId)))
    .groupBy(homeopsPlayLog.backlogEntryId);

  const out = new Map<number, Sums>();
  for (const r of [...starlog, ...homeops]) {
    const cur = out.get(r.id) ?? { tenths: 0n, rows: 0 };
    out.set(r.id, { tenths: cur.tenths + tenthsOf(r.m), rows: cur.rows + r.n });
  }
  return out;
}

/**
 * 합 → 캐시 칸. 기록이 없으면 null. 0 밑·상한 위는 잘라 둔다 — STARLOG 쪽 쓰기는 넘기 전에 막지만(`guard`),
 * homeops가 일정을 지우거나 크게 넣으면 넘을 수 있다. 그때 캐시 칸이 터지면 기동이 서므로 자른다
 */
function totalOf(s: Sums | undefined): string | null {
  if (!s || s.rows === 0) return null;
  const t = s.tenths < 0n ? 0n : s.tenths > MAX_TENTHS ? MAX_TENTHS : s.tenths;
  return hoursText(t);
}

async function current(d: Db, entryId: number): Promise<Sums> {
  return (await sumsByEntry(d, nowKst(), entryId)).get(entryId) ?? { tenths: 0n, rows: 0 };
}

const currentTenths = async (d: Db, entryId: number) => (await current(d, entryId)).tenths;

/** 기록을 바꾼 뒤 합계 캐시를 맞춘다. 같은 값이면 안 쓴다(`updated_at` 그대로) */
export async function syncPlayTime(d: Db, entry: EntryRow, extra: Partial<EntryRow> = {}) {
  const total = totalOf((await sumsByEntry(d, nowKst(), entry.id)).get(entry.id));
  await saveEntryIfChanged(d, entry, { ...extra, playTimeHours: total });
}

/** 기동 때 — homeops가 앱이 꺼진 동안 썼거나, 그동안 일정이 끝났을 수 있다. 바뀐 항목만 쓴다 */
export async function syncAllPlayTimes(d: Db): Promise<number> {
  const sums = await sumsByEntry(d, nowKst());
  const entries = await d.select().from(backlogEntry).orderBy(asc(backlogEntry.id));
  let changed = 0;
  for (const e of entries) {
    if (await saveEntryIfChanged(d, e, { playTimeHours: totalOf(sums.get(e.id)) })) changed++;
  }
  return changed;
}

/**
 * homeops 일정이 **앱이 도는 중에** 끝나면(또는 클라우드에서 homeops가 그사이 쓰면) 캐시가 낡는다 — 읽기 전에 맞춘다.
 * 낡은 캐시를 화면이 "지금까지"의 기준값으로 보여 주면, 그 값으로 저장할 때 끝난 일정 몫이 ADJUST로 지워진다.
 * 일정이 있는 항목만 본다 (없으면 쿼리 하나로 끝)
 */
export async function refreshHomeopsTotals(d: Db): Promise<number> {
  const ids = await d.selectDistinct({ id: homeopsPlayLog.backlogEntryId }).from(homeopsPlayLog);
  if (ids.length === 0) return 0;
  const sums = await sumsByEntry(d, nowKst());
  const entries = await d.select().from(backlogEntry).where(inArray(backlogEntry.id, ids.map((r) => r.id)));
  let changed = 0;
  for (const e of entries) {
    if (await saveEntryIfChanged(d, e, { playTimeHours: totalOf(sums.get(e.id)) })) changed++;
  }
  return changed;
}

/** 합계를 보여 주는 조회(백로그·통계) 앞에 거는 미들웨어. 쓰기 요청은 자기 쪽에서 합을 새로 센다 */
export const freshPlayTimes: MiddlewareHandler = async (c, next) => {
  if (c.req.method === "GET") {
    // 맞추기는 덤이다 — 실패해도 조회는 그대로 (낡은 캐시를 보여 주는 것뿐이고, 진짜 DB 고장이면 본 처리에서 드러난다)
    try { await db().transaction((tx) => refreshHomeopsTotals(tx)); } catch (e) { console.warn("플레이타임 합계 맞추기 실패", e); }
  }
  await next();
};

/**
 * 바꾼 뒤의 합계가 0 밑이거나 상한 위면 거절. homeops 몫까지 더한 합으로 본다.
 * **늘리는 쪽은 0 밑이어도 받는다** — homeops가 일정을 지워 합이 이미 0 밑(화면엔 0)일 수 있는데,
 * 그때 30분 추가까지 막으면 고칠 길이 없다
 */
function guard(before: bigint, after: bigint) {
  if (after < 0n && after < before) {
    throw new InvalidInput(`플레이타임 합계가 0보다 작아집니다 (바꾼 뒤 ${durationText(after)}). 줄이는 양을 확인해 주세요`);
  }
  if (after > MAX_TENTHS && after > before) throw new InvalidInput("플레이타임 합계는 99,999시간 59분을 넘을 수 없습니다");
}

// ───────────── 목록 ─────────────

export interface PlayRecordView {
  recordId: number;
  source: "STARLOG" | "HOMEOPS";
  kind: PlayRecordKind | "HOMEOPS";
  minutes: number;
  /** 날짜(KST). homeops는 시작 시각의 날짜 */
  playedOn: string;
  startedAt: string | null;
  endedAt: string | null;
  note: string | null;
  /** STARLOG 기록만 고치고 지울 수 있다 */
  editable: boolean;
  /** 합계에 들어갔는가 — 아직 안 끝난 일정은 false */
  counted: boolean;
}

/**
 * 두 출처를 합쳐 최신순, 쪽으로 자른다. 쪽 경계가 출처를 가로지르므로 **한 SQL**(`union all` + order + limit)이어야 한다.
 * 순서 — 날짜, 같은 날이면 STARLOG는 만든 시각·homeops는 시작 시각, 그다음 출처·번호(번호는 두 표가 따로 매겨 겹친다).
 * 마지막 둘이 있어야 쪽을 넘나들 때 같은 줄이 겹치거나 빠지지 않는다
 */
export async function listPlayRecords(d: Db, entryId: number, page: number, size: number) {
  await findAliveEntry404(d, entryId);
  const p = normalizePage(page), s = normalizeSize(size);
  const now = nowKst();
  const list = await rows<{
    recordId: number; source: "STARLOG" | "HOMEOPS"; kind: PlayRecordKind | "HOMEOPS"; minutes: string;
    playedOn: string; startedAt: string | null; endedAt: string | null; note: string | null; counted: boolean;
  }>(d, sql`select * from (
      select id as "recordId", 'STARLOG' as source, kind, minutes::text as minutes, played_on as "playedOn",
             null::timestamp as "startedAt", null::timestamp as "endedAt", note, true as counted, created_at as at
        from play_record where backlog_entry_id = ${entryId}
      union all
      select id, 'HOMEOPS', 'HOMEOPS', minutes::text, started_at::date, started_at, ended_at, label,
             ended_at <= ${now}::timestamp, started_at
        from homeops_play_log where backlog_entry_id = ${entryId}
    ) r order by r."playedOn" desc, r.at desc nulls last, r.source desc, r."recordId" desc
    limit ${s} offset ${p * s}`);
  const total = (await one<{ n: number }>(d, sql`select
      (select count(*) from play_record where backlog_entry_id = ${entryId})::int
    + (select count(*) from homeops_play_log where backlog_entry_id = ${entryId})::int as n`))!.n;

  const items: PlayRecordView[] = list.map((r) => ({
    recordId: r.recordId, source: r.source, kind: r.kind, minutes: Number(r.minutes), playedOn: r.playedOn,
    startedAt: ldt(r.startedAt), endedAt: ldt(r.endedAt), note: r.note,
    editable: r.source === "STARLOG", counted: r.counted,
  }));
  return pageOf(items, p, s, total);
}

// ───────────── STARLOG 기록 쓰기 ─────────────

export interface PlayRecordCommand { minutes: string | null; playedOn: string | null; note: string | null }

/** 분 → 0.1분. 필수·종류별 부호. 0 이하 추가는 "더하기"가 아니다 */
function amountOf(kind: PlayRecordKind, minutes: string | null): bigint {
  if (minutes === null) throw new InvalidInput("플레이 시간(분)은 필수입니다");
  const t = tenthsOf(minutes);
  if (kind === "ADD" && t <= 0n) throw new InvalidInput("추가하는 플레이 시간은 0분보다 커야 합니다");
  if (kind === "BASELINE" && t < 0n) throw new InvalidInput("기존 기록은 0분 이상이어야 합니다");
  return t;
}

/** 직접 만드는 건 추가(ADD)뿐이다 — 직접 수정(ADJUST)은 합계를 고칠 때 차이로 생기고, BASELINE은 V15만 만든다 */
export async function addPlayRecord(d: Db, entryId: number, cmd: PlayRecordCommand): Promise<number> {
  const entry = await findAliveEntryForUpdate(d, entryId);
  const t = amountOf("ADD", cmd.minutes);
  const before = await currentTenths(d, entryId);
  guard(before, before + t);
  const id = await insertRecord(d, entryId, "ADD", t, cmd.playedOn, cmd.note);
  await syncPlayTime(d, entry);
  return id;
}

async function insertRecord(d: Db, entryId: number, kind: PlayRecordKind, t: bigint, playedOn: string | null, note: string | null) {
  const now = nowKst();
  const [row] = await d.insert(playRecord).values({
    backlogEntryId: entryId, kind, minutes: minutesText(t), playedOn: playedOn ?? todayKst(), note: normalize(note),
    createdAt: now, updatedAt: now,
  }).returning({ id: playRecord.id });
  return row!.id;
}

/** 기록 찾기 — 항목이 삭제됐으면 409(다른 하위 기록과 같다). 항목 행을 잠근다(합계 검사를 직렬화) */
async function findRecord(d: Db, recordId: number) {
  const [r] = await d.select().from(playRecord).where(eq(playRecord.id, recordId));
  if (!r) throw new NotFound(`플레이 기록을 찾을 수 없습니다. id=${recordId}`);
  const entry = await findAliveEntryForUpdate(d, r.backlogEntryId);
  return { r, entry };
}

/** 양·날짜·메모를 통째로 갈아 넣는다(다른 PUT처럼). 날짜를 비우면 오늘 — 기록에는 날짜가 늘 있다 */
export async function updatePlayRecord(d: Db, recordId: number, cmd: PlayRecordCommand) {
  const { r, entry } = await findRecord(d, recordId);
  const t = amountOf(r.kind as PlayRecordKind, cmd.minutes);
  const before = await currentTenths(d, entry.id);
  guard(before, before - tenthsOf(r.minutes) + t);
  await saveIfChanged(d, r, { minutes: minutesText(t), playedOn: cmd.playedOn ?? todayKst(), note: normalize(cmd.note) },
    (patch) => d.update(playRecord).set(patch).where(eq(playRecord.id, r.id)), ["minutes"]);
  await syncPlayTime(d, entry);
}

export async function deletePlayRecord(d: Db, recordId: number) {
  const { r, entry } = await findRecord(d, recordId);
  const before = await currentTenths(d, entry.id);
  guard(before, before - tenthsOf(r.minutes));
  await d.delete(playRecord).where(eq(playRecord.id, r.id));
  await syncPlayTime(d, entry);
}

/**
 * 개인 기록 저장의 플레이타임 몫 — 덮어쓰지 않고 **기록으로** 남긴다.
 *
 *   - `targetTenths`(합계를 이 값으로): 지금 합과 다르면 차이만큼 ADJUST
 *   - `addTenths`(이번에 한 만큼): ADD
 *
 * 둘 다 오늘 날짜. 순서는 ADJUST → ADD (화면 미리보기가 "고친 합계 + 더한 시간"이다).
 * 합계 캐시는 부르는 쪽이 평점·메모와 한 번에 맞춘다(`syncPlayTime`의 extra) — `updated_at`이 한 번만 움직이게
 */
export async function recordPlayTimeChange(d: Db, entry: EntryRow, targetTenths: bigint | null, addTenths: bigint | null) {
  const cur = await current(d, entry.id);
  // 기록이 하나도 없을 때 0으로 적는 것도 바뀜이다 — "안 적음"(null)과 "0시간"은 다르다
  const adjust = targetTenths === null ? null
    : targetTenths !== cur.tenths || cur.rows === 0 ? targetTenths - cur.tenths : null;
  if (addTenths !== null && addTenths <= 0n) throw new InvalidInput("추가하는 플레이 시간은 0분보다 커야 합니다");
  guard(cur.tenths, cur.tenths + (adjust ?? 0n) + (addTenths ?? 0n));
  if (adjust !== null) await insertRecord(d, entry.id, "ADJUST", adjust, null, null);
  if (addTenths !== null) await insertRecord(d, entry.id, "ADD", addTenths, null, null);
}
