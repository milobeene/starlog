/**
 * 요청 본문 모양(Zod) 공용 조각 — 기존 Jackson 역직렬화의 관대함을 맞춘다.
 *
 * 모양만 본다. **없거나 null이면 null**.
 * 규칙(필수·길이)은 `violations()`로 따로 — 메시지가 다르다.
 */
import { z } from "zod";

/**
 * String 필드 — Jackson은 **숫자·불리언도 문자열로 받아준다** (`{"color": 5}` → `"5"`).
 * `z.string()`으로만 받으면 기존엔 되던 입력이 "읽을 수 없음"으로 튕긴다
 */
export const zText = z.union([z.string(), z.number().transform(String), z.boolean().transform(String)]);

/** LocalDate — `"2026-10-19"`. 잘못된 날짜(2월 30일)도 읽기 단계에서 거절한다 (Jackson도 그랬다) */
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
