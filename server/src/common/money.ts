/**
 * 금액 — 자바 `Money`. scale 2, HALF_UP, 0 이상, ISO 4217.
 *
 * **부동소수 계산 금지.** 문자열 ↔ 정수(센트, BigInt)로만 다룬다. JSON으로 들어온 숫자는
 * `String(n)`으로 받는다 — JS의 가장 짧은 왕복 표기라 원래 JSON 글자와 같다.
 */
import { InvalidInput, Unreadable } from "./errors";

const CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

export interface Money { amount: string; currency: string }

/** `12000.555` → `12000.56` (HALF_UP). 음수면 그대로 부호를 단다 */
export function scale2(input: string | number): string {
  const s = typeof input === "number" ? numberToPlain(input) : input.trim();
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new InvalidInput(`금액 형식이 올바르지 않습니다: ${input}`);
  const neg = m[1] === "-";
  const int = m[2] || "0";
  const frac = m[3] ?? "";
  let cents = BigInt(int) * 100n + BigInt((frac + "00").slice(0, 2));
  if ((frac[2] ?? "0") >= "5") cents += 1n;            // HALF_UP — 크기 기준으로 올린다
  return format(neg && cents !== 0n ? -cents : cents);
}

/** 금액 생성 — 자바 `new Money(amount, currency)`와 같은 검증·메시지 */
export function money(amount: string | number | null | undefined, currency: string | null | undefined): Money {
  if (amount === null || amount === undefined) throw new InvalidInput("금액은 필수입니다");
  if (currency === null || currency === undefined) throw new InvalidInput("통화는 필수입니다");
  const scaled = scale2(amount);
  if (scaled.startsWith("-")) throw new InvalidInput(`금액은 0 이상이어야 합니다: ${typeof amount === "number" ? numberToPlain(amount) : amount}`);
  const code = currency.trim().toUpperCase();
  if (!CURRENCIES.has(code)) throw new InvalidInput(`ISO 4217 통화 코드가 아닙니다: ${currency}`);
  return { amount: scaled, currency: code };
}

/** 응답용 — DB의 numeric 문자열을 숫자로. 화면은 숫자로 받는다 (자바도 JSON 숫자로 냈다) */
export function amountJson(amount: string | null | undefined): number | null {
  return amount === null || amount === undefined ? null : Number(amount);
}

/** 비교 — `compareTo` 대신. 둘 다 scale 2 문자열이라고 가정하지 않는다 */
export function compareAmount(a: string, b: string): number {
  const x = toCents(scale2(a)), y = toCents(scale2(b));
  return x < y ? -1 : x > y ? 1 : 0;
}

export function toCents(scaled: string): bigint {
  const neg = scaled.startsWith("-");
  const [i, f = "00"] = scaled.replace("-", "").split(".");
  const v = BigInt(i!) * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -v : v;
}

function format(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const s = `${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
  return neg ? "-" + s : s;
}

/** 1e21 이상·지수 표기 숫자도 평문으로 */
function numberToPlain(n: number): string {
  if (!Number.isFinite(n)) throw new InvalidInput(`금액 형식이 올바르지 않습니다: ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

// ───────────── 임의 자릿수 BigDecimal (본문에서 온 소수 — 평점·플레이타임 등) ─────────────

export const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** 값 비교용 정규형 — 앞 0·뒤 0·부호 없는 0을 걷어낸다 */
export function decimalKey(s: string): string {
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
