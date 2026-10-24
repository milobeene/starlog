/**
 * 변경 감지 흉내 — 하이버네이트는 **값이 실제로 바뀐 행만** UPDATE하고 그때만 `updated_at`을 바꾼다.
 * 같은 값으로 수정하면 `updated_at`이 그대로다. 녹화본이 이 동작에 묶여 있다
 */
import type { Db } from "./client";
import { nowKst } from "../common/clock";
import { DECIMAL, decimalKey } from "../common/money";

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
  _d: Db, before: T, after: Partial<T>, write: (patch: Partial<T> & { updatedAt: string }) => Promise<unknown>,
): Promise<boolean> {
  const changed = Object.keys(after).some((k) => !sameValue(before[k], after[k]));
  if (!changed) return false;
  await write({ ...after, updatedAt: nowKst() });
  return true;
}
