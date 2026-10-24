/**
 * 요청 본문 — 기존 Spring 서버의 두 단계를 그대로 나눈다 (화면이 두 메시지를 구분해 띄운다).
 *
 * 1. **읽기**(Jackson): 깨진 JSON·없는 enum·타입 불일치 → 400 "요청 본문을 읽을 수 없습니다"
 *    → `readBody(c, zodSchema)`. 스키마는 **모양만** 본다 (`.nullish()` 위주, 모르는 키는 버린다)
 * 2. **검증**(Bean Validation): `@NotBlank`·`@Size` 등 → 400 "필드: 메시지, 필드: 메시지"
 *    → `violations()` 빌더로 쌓았다가 `.throwIfAny()`
 *    ⚠️ 위반이 **둘 이상**이면 Bean Validation의 메시지 순서가 실행마다 바뀐다(해시 집합). 맞출 수 없으니
 *    골든 시나리오는 위반이 하나만 나게 짠다. 같은 필드에 `@NotBlank`+`@Size`가 함께 걸리는 입력도 피한다
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
    if (text.trim() === "") throw new Unreadable();     // 스프링도 본문이 없으면 같은 400이었다
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
 * Bean Validation 흉내. 규칙은 Hibernate Validator 기준:
 * - `notBlank`: null이거나 **자바 공백(`Character.isWhitespace`)만**이면 위반 — 전각 공백(U+3000)도 공백이다.
 *   (`String.trim()`(U+0020 이하)과는 다르다 — 실측으로 어긋남을 찾았다, 2026-10-24)
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
 * 메시지를 안 단 제약의 기본 문구 — Hibernate Validator 9.1 `ValidationMessages_ko`.
 * 원래는 요청 언어를 따랐는데 일렉트론은 한국어로 보내므로 한국어로 고정한다
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

// ───────────── 원문 숫자를 그대로 읽는 본문 ─────────────

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

/** Bean Validation의 컨테이너 원소 제약 — 필드 이름이 `names[0]` 꼴이다 */
export function elementSizeViolations(field: string, values: readonly (string | null)[] | null, max: number, message: string) {
  const out: string[] = [];
  values?.forEach((v, i) => { if (v !== null && v.length > max) out.push(`${field}[${i}]: ${message}`); });
  return out;
}
