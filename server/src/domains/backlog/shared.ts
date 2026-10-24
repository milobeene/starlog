/**
 * 백로그 도메인 공용 — 자바 `BacklogEntryFinder`, `BacklogEntry`의 파생 상태 계산, 변경 감지 흉내.
 */
import type { Context } from "hono";
import type { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { acquisition, backlogEntry, playthrough } from "../../db/schema";
import { Conflict, NotFound, Unreadable } from "../../common/errors";
import { nowKst } from "../../common/clock";

export const BACKLOG_STATUSES = ["WISHLIST", "BACKLOG", "PLAYING", "PAUSED", "DROPPED", "COMPLETED"] as const;
export const PLAYTHROUGH_STATUSES = ["PLAYING", "PAUSED", "DROPPED", "COMPLETED"] as const;
export const ACQUISITION_METHODS = ["PURCHASED", "SUBSCRIPTION", "FREE", "GIFT", "BORROWED", "DEMO", "NOT_OWNED"] as const;

export type BacklogStatus = (typeof BACKLOG_STATUSES)[number];
export type PlaythroughStatus = (typeof PLAYTHROUGH_STATUSES)[number];
export type EntryRow = typeof backlogEntry.$inferSelect;
export type PlaythroughRow = typeof playthrough.$inferSelect;

const notFound = (entryId: number) => new NotFound(`백로그 항목을 찾을 수 없습니다. id=${entryId}`);

// ───────────── 소유권 (BacklogEntryFinder) ─────────────

/** 삭제된 것 포함. 남의 것도 404 — 메시지도 같게 (NFR-S7) */
export async function findOwnedIncludingDeleted(d: Db, memberId: number, entryId: number): Promise<EntryRow> {
  const [row] = await d.select().from(backlogEntry).where(eq(backlogEntry.id, entryId));
  if (!row || row.memberId !== memberId) throw notFound(entryId);
  return row;
}

/** 살아있는 내 항목만. 수정 경로는 전부 이걸 쓴다 */
export async function findOwned(d: Db, memberId: number, entryId: number): Promise<EntryRow> {
  const row = await findOwnedIncludingDeleted(d, memberId, entryId);
  if (row.deletedAt !== null) throw new Conflict(`삭제된 항목입니다. id=${entryId}`);
  return row;
}

/**
 * 항목 행을 잠그고 나서 `findOwned`. 자바는 형제 회차 검증(BR-PT-02·03)을 직렬화하려고 잠갔다.
 * PGlite는 세션이 하나라 원래 직렬이지만, 클라우드(Postgres)에서는 자바와 같은 이유로 필요하다
 */
export async function findOwnedForUpdate(d: Db, memberId: number, entryId: number): Promise<EntryRow> {
  const [locked] = await d.select({ id: backlogEntry.id }).from(backlogEntry)
    .where(eq(backlogEntry.id, entryId)).for("update");
  if (!locked) throw notFound(entryId);
  return findOwned(d, memberId, entryId);
}

/** 상세용 — 삭제된 항목은 조건에서 걸러져 404 (findOwned의 409와 의도적으로 다르다) */
export async function findOwnedAlive404(d: Db, memberId: number, entryId: number): Promise<EntryRow> {
  const [row] = await d.select().from(backlogEntry).where(eq(backlogEntry.id, entryId));
  if (!row || row.deletedAt !== null || row.memberId !== memberId) throw notFound(entryId);
  return row;
}

// ───────────── 파생 상태 (BacklogEntry.syncDerivedState, §7.6) ─────────────

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

// ───────────── 변경 감지 흉내 ─────────────

/**
 * 하이버네이트는 **값이 실제로 바뀐 엔티티만** UPDATE하고 그때만 `updatedAt`을 바꾼다.
 * 금액·평점은 `compareTo`로 본다 (BigDecimalJavaType) — `85.0`과 `85.00`은 같은 값이다
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === "string" && typeof b === "string" && DECIMAL.test(a) && DECIMAL.test(b)) {
    return decimalKey(a) === decimalKey(b);
  }
  return false;
}

/** 바뀐 칸이 있으면 그 행만 UPDATE (+ updatedAt). 반환값은 바뀌었는지 */
export async function saveIfChanged<T extends Record<string, unknown>>(
  d: Db, before: T, after: Partial<T>, write: (patch: Partial<T> & { updatedAt: string }) => Promise<unknown>,
): Promise<boolean> {
  const changed = Object.keys(after).some((k) => !sameValue(before[k], after[k]));
  if (!changed) return false;
  await write({ ...after, updatedAt: nowKst() });
  return true;
}

export function saveEntryIfChanged(d: Db, before: EntryRow, after: Partial<EntryRow>) {
  return saveIfChanged(d, before, after, (patch) =>
    d.update(backlogEntry).set(patch).where(eq(backlogEntry.id, before.id)));
}

// ───────────── BigDecimal ─────────────

const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** 값 비교용 정규형 — 앞 0·뒤 0·부호 없는 0을 걷어낸다 */
function decimalKey(s: string): string {
  const neg = s.startsWith("-");
  const [i = "", f = ""] = s.replace(/^[+-]/, "").split(".");
  const int = i.replace(/^0+/, "") || "0";
  const frac = f.replace(/0+$/, "");
  const zero = int === "0" && frac === "";
  return `${neg && !zero ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}

/** `setScale(n, HALF_UP)` — 부동소수 없이 */
export function setScale(input: string, n: number): string {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(input.trim());
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new Unreadable();
  const neg = m[1] === "-";
  const frac = m[3] ?? "";
  const pow = 10n ** BigInt(n);
  let v = BigInt(m[2] || "0") * pow + BigInt((frac + "0".repeat(n)).slice(0, n) || "0");
  if ((frac[n] ?? "0") >= "5") v += 1n;            // HALF_UP — 크기 기준으로 올린다
  const s = `${v / pow}${n > 0 ? "." + (v % pow).toString().padStart(n, "0") : ""}`;
  return neg && v !== 0n ? "-" + s : s;
}

/** 자바 `BigDecimal.toString()` — 오류 메시지에 원래 값이 그대로 실린다 (`150.0`은 `150.0`) */
export function bigDecimalText(input: string): string {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(input.trim());
  if (!m) return input;
  const frac = m[3] ?? "";
  const digits = (BigInt((m[2] || "0") + frac)).toString();
  const neg = m[1] === "-" && digits !== "0";
  const body = frac.length === 0 ? digits
    : (() => { const p = digits.padStart(frac.length + 1, "0"); return `${p.slice(0, -frac.length)}.${p.slice(-frac.length)}`; })();
  return (neg ? "-" : "") + body;
}

export function compareDecimal(a: string, b: string): number {
  const scale = Math.max(fracLen(a), fracLen(b));
  const x = BigInt(setScale(a, scale).replace(".", "")), y = BigInt(setScale(b, scale).replace(".", ""));
  return x < y ? -1 : x > y ? 1 : 0;
}
const fracLen = (s: string) => (s.split(".")[1] ?? "").length;

// ───────────── 본문 읽기 ─────────────

type Reviver = (key: string, value: unknown, context?: { source?: string }) => unknown;
const parseWithSource = JSON.parse as (text: string, reviver: Reviver) => unknown;

/**
 * `readBody`와 같은 규칙인데 **JSON 숫자를 원문 글자 그대로** 넘긴다.
 *
 * Jackson은 BigDecimal을 JSON 글자에서 바로 만든다 — `150.0`은 `150.0`이다. `JSON.parse`는
 * `150`으로 뭉개서 "평점은 0.0 ~ 100.0 범위여야 합니다: 150.0" 같은 메시지가 갈린다.
 * 숫자 칸 스키마(`zDecimal`·`zLong`)는 숫자 문자열도 받으므로 그대로 통과한다.
 * 덤으로 문자열 칸에 숫자가 오면 문자열로 받는다 — Jackson도 그렇게 강제 변환한다
 */
export async function readBodyExact<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    const text = await c.req.text();
    if (text.trim() === "") throw new Unreadable();
    raw = parseWithSource(text, (_k, v, ctx) => (typeof v === "number" && ctx?.source !== undefined ? ctx.source : v));
  } catch {
    throw new Unreadable();
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new Unreadable();
  return r.data;
}

/** Bean Validation의 컨테이너 원소 제약 — 필드 이름이 `names[0]` 꼴이다 (SpringValidatorAdapter) */
export function elementSizeViolations(field: string, values: readonly (string | null)[] | null, max: number, message: string) {
  const out: string[] = [];
  values?.forEach((v, i) => { if (v !== null && v.length > max) out.push(`${field}[${i}]: ${message}`); });
  return out;
}

/** 상세·목록에서 쓰는 금액 응답 — 두 칸이 다 null이면 하이버네이트 임베디드도 null이다 */
export function moneyResponse(amount: string | null, currency: string | null) {
  if (amount === null && currency === null) return null;
  return { amount: amount === null ? null : Number(amount), currency };
}
