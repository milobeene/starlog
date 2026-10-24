/**
 * 요청 본문 — 스프링의 두 단계를 그대로 나눈다.
 *
 * 1. **읽기**(Jackson): 깨진 JSON·없는 enum·타입 불일치 → 400 "요청 본문을 읽을 수 없습니다"
 *    → `readBody(c, zodSchema)`. 스키마는 **모양만** 본다 (`.nullish()` 위주, 모르는 키는 버린다)
 * 2. **검증**(Bean Validation): `@NotBlank`·`@Size` 등 → 400 "필드: 메시지, 필드: 메시지"
 *    → `violations()` 빌더로 쌓았다가 `.throwIfAny()`
 *    ⚠️ 위반이 **둘 이상**이면 자바의 메시지 순서가 실행마다 바뀐다(해시 집합). 맞출 수 없으니
 *    비교 시나리오는 위반이 하나만 나게 짠다. 같은 필드에 `@NotBlank`+`@Size`가 함께 걸리는 입력도 피한다
 *
 * 둘을 섞지 않는 이유 — 메시지가 다르다. 화면은 2번의 메시지를 그대로 띄운다.
 */
import type { Context } from "hono";
import type { z } from "zod";
import { InvalidInput, Unreadable } from "../common/errors";
import { normalize } from "../common/text";

export async function readBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    const text = await c.req.text();
    if (text.trim() === "") throw new Unreadable();     // 스프링: "Required request body is missing"
    raw = JSON.parse(text);
  } catch {
    throw new Unreadable();
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new Unreadable();
  return r.data;
}

/** 본문이 없어도 되는 자리(`@RequestBody(required = false)`) */
export async function readOptionalBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S> | null> {
  const text = await c.req.text().catch(() => "");
  if (text.trim() === "") return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Unreadable(); }
  const r = schema.safeParse(raw);
  if (!r.success) throw new Unreadable();
  return r.data;
}

/**
 * Bean Validation 흉내. 규칙은 하이버네이트 밸리데이터 기준:
 * - `notBlank`: null이거나 **자바 공백(`Character.isWhitespace`)만**이면 위반 — 전각 공백(U+3000)도 공백이다.
 *   (처음엔 `String.trim()`(U+0020 이하)으로 짰다가 platform 이전에서 실측으로 어긋남을 찾았다 — 2026-10-24)
 * - `size`: null은 통과. 길이는 UTF-16 단위 (`String.length()`)
 * - `pattern`: null은 통과. **전체 일치**
 */
export function violations() {
  const list: string[] = [];
  const api = {
    notNull(field: string, v: unknown, message: string) {
      if (v === null || v === undefined) list.push(`${field}: ${message}`);
      return api;
    },
    notBlank(field: string, v: string | null | undefined, message: string) {
      if (v === null || v === undefined || normalize(v) === null) list.push(`${field}: ${message}`);
      return api;
    },
    size(field: string, v: string | readonly unknown[] | null | undefined, min: number, max: number, message: string) {
      if (v !== null && v !== undefined && (v.length < min || v.length > max)) list.push(`${field}: ${message}`);
      return api;
    },
    pattern(field: string, v: string | null | undefined, re: RegExp, message: string) {
      if (v !== null && v !== undefined) {
        const full = new RegExp(`^(?:${re.source})$`, re.flags.replace("g", ""));
        if (!full.test(v)) list.push(`${field}: ${message}`);
      }
      return api;
    },
    positive(field: string, v: number | null | undefined, message: string) {
      if (v !== null && v !== undefined && !(v > 0)) list.push(`${field}: ${message}`);
      return api;
    },
    when(cond: boolean, field: string, message: string) {
      if (cond) list.push(`${field}: ${message}`);
      return api;
    },
    throwIfAny() {
      if (list.length) throw new InvalidInput(list.join(", "));
    },
  };
  return api;
}


/**
 * 메시지를 안 단 제약의 기본 문구 — 하이버네이트 밸리데이터 9.1 `ValidationMessages_ko`.
 * 자바는 요청 언어를 따랐는데 일렉트론은 한국어로 보낸다. 우리는 한국어로 고정한다
 */
export const DEFAULT_MSG = {
  notBlank: "공백일 수 없습니다",
  notNull: "널이어서는 안됩니다",
  notEmpty: "비어 있을 수 없습니다",
  positive: "0보다 커야 합니다",
  /** `@Size(max = 100)`이면 min은 0. `@Size(min = 1)`만이면 max는 2147483647 */
  size: (min: number, max: number) => `크기가 ${min}에서 ${max} 사이여야 합니다`,
  pattern: (regexp: string) => `"${regexp}"와 일치해야 합니다`,
  min: (v: number) => `${v} 이상이어야 합니다`,
  max: (v: number) => `${v} 이하여야 합니다`,
} as const;
