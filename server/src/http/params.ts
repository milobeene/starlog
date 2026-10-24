/**
 * 경로·쿼리 파라미터 — 스프링 `@PathVariable`·`@RequestParam` 바인딩과 같은 규칙.
 *
 * - 없거나 빈 문자열이면 null (스프링 숫자·날짜·enum 변환기가 빈 문자열을 null로 본다)
 * - 형식이 틀리면 400 `"{이름} 값이 올바르지 않습니다"` (`MethodArgumentTypeMismatchException`)
 * - 목록(`List<Enum>`)은 `?a=X&a=Y`와 `?a=X,Y` 둘 다 받는다 (스프링이 콤마를 나눈다)
 * - 문자열은 그대로 — `?q=`면 `""`이다 (스프링도 String은 변환하지 않는다).
 *   **반복되면 콤마로 이어 붙인다** — `?q=a&q=b` → `"a,b"` (스프링 String 바인딩)
 */
import type { Context } from "hono";
import { InvalidInput } from "../common/errors";

const mismatch = (name: string) => new InvalidInput(`${name} 값이 올바르지 않습니다`);
const LONG = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

function parseLong(name: string, raw: string): number {
  const s = raw.trim();
  if (!LONG.test(s)) throw mismatch(name);
  const n = Number(s);
  if (!Number.isSafeInteger(n)) throw mismatch(name);
  return n;
}

function parseInt32(name: string, raw: string): number {
  const n = parseLong(name, raw);
  if (n < -2147483648 || n > 2147483647) throw mismatch(name);
  return n;
}

function parseDate(name: string, raw: string): string {
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw mismatch(name);
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  if (d.getUTCFullYear() !== +m[1]! || d.getUTCMonth() !== +m[2]! - 1 || d.getUTCDate() !== +m[3]!) throw mismatch(name);
  return s;
}

const TRUE = new Set(["true", "on", "yes", "1"]);
const FALSE = new Set(["false", "off", "no", "0"]);

export function pathId(c: Context, name: string): number {
  return parseLong(name, c.req.param(name) ?? "");
}

export class Query {
  constructor(private readonly c: Context) {}

  private first(name: string): string | null {
    const v = this.c.req.query(name);
    return v === undefined ? null : v;
  }
  private blankToNull(name: string): string | null {
    const v = this.first(name);
    return v === null || v.trim() === "" ? null : v;
  }

  str(name: string): string | null {
    const all = this.c.req.queries(name);
    return all && all.length > 1 ? all.join(",") : this.first(name);
  }

  long(name: string): number | null {
    const v = this.blankToNull(name);
    return v === null ? null : parseLong(name, v);
  }

  int(name: string): number | null;
  int(name: string, fallback: number): number;
  int(name: string, fallback?: number): number | null {
    const v = this.blankToNull(name);
    return v === null ? (fallback ?? null) : parseInt32(name, v);
  }

  date(name: string): string | null {
    const v = this.blankToNull(name);
    return v === null ? null : parseDate(name, v);
  }

  /** BigDecimal — 문자열로 돌려준다 (계산은 `common/money.ts`) */
  decimal(name: string): string | null {
    const v = this.blankToNull(name);
    if (v === null) return null;
    if (!DECIMAL.test(v.trim())) throw mismatch(name);
    return v.trim();
  }

  bool(name: string): boolean | null;
  bool(name: string, fallback: boolean): boolean;
  bool(name: string, fallback?: boolean): boolean | null {
    const v = this.blankToNull(name);
    if (v === null) return fallback ?? null;
    const s = v.trim().toLowerCase();
    if (TRUE.has(s)) return true;
    if (FALSE.has(s)) return false;
    throw mismatch(name);
  }

  enumOf<T extends string>(name: string, values: readonly T[]): T | null {
    const v = this.blankToNull(name);
    if (v === null) return null;
    const s = v.trim();
    if (!(values as readonly string[]).includes(s)) throw mismatch(name);
    return s as T;
  }

  enumList<T extends string>(name: string, values: readonly T[]): T[] | null {
    const all = this.c.req.queries(name);
    if (!all || all.length === 0) return null;
    const items = all.flatMap(v => v.split(",")).map(s => s.trim()).filter(s => s !== "");
    for (const s of items) if (!(values as readonly string[]).includes(s)) throw mismatch(name);
    return items as T[];
  }

  longList(name: string): number[] | null {
    const all = this.c.req.queries(name);
    if (!all || all.length === 0) return null;
    return all.flatMap(v => v.split(",")).map(s => s.trim()).filter(s => s !== "").map(s => parseLong(name, s));
  }

  strList(name: string): string[] | null {
    const all = this.c.req.queries(name);
    if (!all || all.length === 0) return null;
    return all.flatMap(v => v.split(",")).map(s => s.trim());
  }
}

export const query = (c: Context) => new Query(c);
