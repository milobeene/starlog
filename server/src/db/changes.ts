/**
 * 변경 감지 — 기존 서버(Hibernate)는 **값이 실제로 바뀐 행만** UPDATE하고 그때만 `updated_at`을 바꿨다.
 * 같은 값으로 수정하면 `updated_at`이 그대로다. 골든 시나리오가 이 동작에 묶여 있다
 */
import type { Db } from "./client";
import { nowKst } from "../common/clock";
import { DECIMAL, decimalKey } from "../common/money";

/**
 * 값이 같은가. `numeric`이면 숫자로 본다(자바 `BigDecimal.compareTo`처럼) — `85.0`과 `85.00`은 같은 값이다.
 * **숫자 칸에만** 켠다 — 글자 칸(닉네임·메모·라벨)에서 `"007"`→`"7"`을 같은 값으로 보면 수정이 저장되지 않는다
 */
export function sameValue(a: unknown, b: unknown, numeric = false): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (numeric && typeof a === "string" && typeof b === "string" && DECIMAL.test(a) && DECIMAL.test(b)) {
    return decimalKey(a) === decimalKey(b);
  }
  return false;
}

/**
 * 바뀐 칸이 있으면 그 행만 UPDATE (+ updatedAt). 반환값은 바뀌었는지.
 * `numeric` — DB `numeric` 칸 이름들 (드라이버가 원문 글자로 줘서 자릿수만 다를 수 있다)
 */
export async function saveIfChanged<T extends Record<string, unknown>>(
  _d: Db, before: T, after: Partial<T>, write: (patch: Partial<T> & { updatedAt: string }) => Promise<unknown>,
  numeric: readonly (keyof T & string)[] = [],
): Promise<boolean> {
  const changed = Object.keys(after).some((k) => !sameValue(before[k], after[k], numeric.includes(k)));
  if (!changed) return false;
  await write({ ...after, updatedAt: nowKst() });
  return true;
}
