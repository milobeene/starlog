/**
 * 요청 본문 모양(Zod) 공용 조각 — 자바 DTO 필드 타입과 Jackson의 관대함을 맞춘다.
 *
 * 모양만 본다. **없거나 null이면 null** (자바 record 필드가 null로 들어오는 것과 같다).
 * 규칙(필수·길이)은 `violations()`로 따로 — 메시지가 다르다.
 */
import { z } from "zod";

/** LocalDate — `"2026-10-19"`. 잘못된 날짜(2월 30일)도 읽기 단계에서 거절한다 (Jackson과 같다) */
export const zDate = z.string().refine((s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCFullYear() === +m[1]! && d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
});

/** BigDecimal — JSON 숫자든 숫자 문자열이든 받는다 (Jackson이 문자열을 숫자로 바꿔준다) */
export const zDecimal = z.union([z.number(), z.string().regex(/^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$/)]);

/** Long/Integer — 정수. 문자열 정수도 받는다 */
export const zLong = z.union([z.number().int(), z.string().regex(/^\s*[+-]?\d+\s*$/).transform(Number)]);

/** `MoneyRequest` */
export const zMoney = z.object({
  amount: zDecimal.nullish(),
  currency: z.string().nullish(),
}).nullish();

export const opt = <T extends z.ZodType>(t: T) => t.nullish().transform((v) => v ?? null);
