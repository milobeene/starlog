/**
 * 문자열 규칙 — 공백 정리, 정렬 키, 폴더 슬러그.
 * 기존 데이터(정렬 키·폴더 이름)가 이 규칙으로 만들어져 있어 바꾸면 어긋난다.
 */
import { InvalidInput } from "./errors";

/**
 * 앞뒤 공백 제거(`strip` — 유니코드 공백까지), 빈 문자열은 null로 수렴.
 * 기존 서버의 `String.strip()`(`Character.isWhitespace` 기준)에 맞춘다 — JS `trim()`과 거의 같지만
 * NBSP(U+00A0)는 공백으로 안 본다
 */
export function normalize(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const stripped = javaStrip(value);
  return stripped === "" ? null : stripped;
}

export function require(value: string | null | undefined, message: string): string {
  const n = normalize(value);
  if (n === null) throw new InvalidInput(message);
  return n;
}

/** 목록 정리 — 정규화 후 null 제거 */
export function normalizeAll(values: readonly (string | null | undefined)[] | null | undefined): string[] {
  if (!values) return [];
  return values.map(normalize).filter((v): v is string => v !== null);
}

/**
 * 자바 `Character.isWhitespace` 기준 공백 — 공백 문자 중 NBSP(00A0·2007·202F) 제외 + 제어문자 09~0D·1C~1F.
 * 정규식으로 안 쓰는 이유: U+2028·2029가 줄바꿈이라 글자째 들어가면 정규식 리터럴이 깨진다
 */
export function isJavaWhitespace(c: number): boolean {
  return (c >= 0x09 && c <= 0x0d) || (c >= 0x1c && c <= 0x20) || c === 0x1680
    || (c >= 0x2000 && c <= 0x2006) || (c >= 0x2008 && c <= 0x200a)
    || c === 0x2028 || c === 0x2029 || c === 0x205f || c === 0x3000;
}

/** 공백뿐이거나 null이면 true */
export function isJavaBlank(v: string | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  for (let i = 0; i < v.length; i++) if (!isJavaWhitespace(v.charCodeAt(i))) return false;
  return true;
}

/** `strip` — 위 기준의 공백을 앞뒤에서 걷어낸다 */
export function javaStrip(s: string): string {
  let a = 0, b = s.length;
  while (a < b && isJavaWhitespace(s.charCodeAt(a))) a++;
  while (b > a && isJavaWhitespace(s.charCodeAt(b - 1))) b--;
  return s.slice(a, b);
}

/**
 * 정렬 키 — 숫자·기호 → 라틴 → 한글 → 나머지 순으로 묶고 소문자 이름을 붙인다.
 * 첫 글자로 그룹을 정한다
 */
export function sortKey(displayName: string | null | undefined): string | null {
  if (displayName === null || displayName === undefined) return null;
  const n = javaStrip(displayName);
  if (n === "") return null;
  const cp = n.codePointAt(0)!;
  return group(cp) + "|" + n.toLowerCase();
}

function group(cp: number): string {
  const ch = String.fromCodePoint(cp);
  if (/\p{Nd}/u.test(ch) || !/\p{L}/u.test(ch)) return "0";
  if (cp < 0x80) return "1";
  if ((cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x3131 && cp <= 0x318e)) return "2";
  return "3";
}

/** 폴더 이름 상한 — 파일시스템 이름 한도가 255바이트라 글자 수가 아니라 바이트로 센다 (한글은 글자당 3바이트) */
export const SLUG_MAX_BYTES = 200;

/** 윈도우 예약 장치 이름 — 폴더 이름이 이거면 만들지도 열지도 못한다 (`con`, `nul`, `com1`…) */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

/** UTF-8 바이트 상한까지만 남긴다. 글자(코드포인트)를 쪼개지 않는다 */
function cutBytes(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;
  let out = "", bytes = 0;
  for (const ch of s) {
    const n = Buffer.byteLength(ch, "utf8");
    if (bytes + n > maxBytes) break;
    out += ch;
    bytes += n;
  }
  return out;
}

/**
 * 폴더 이름용 슬러그 — 결합 문자 제거, 소문자, 글자·숫자 아닌 건 `-`, 최대 80자(+ 200바이트).
 * ⚠️ 한글은 NFD로 자모가 갈라졌다가 NFC로 다시 붙는다 — 결합 문자(\p{M})만 지우므로 한글은 살아남는다
 * ⚠️ 80자 상한이 먼저라 기존 이름은 그대로다. 바이트 상한은 한글 67자 넘는 이름만 건드린다
 */
export function slug(name: string | null | undefined): string {
  if (name === null || name === undefined || javaStrip(name) === "") return "untitled";
  const decomposed = javaStrip(name).normalize("NFD").replace(/\p{M}/gu, "");
  let s = decomposed.normalize("NFC").toLowerCase()
    .replace(/[^\p{Alphabetic}\p{Nd}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (s === "") return "untitled";
  if (s.length > 80) s = s.slice(0, 80);
  if (Buffer.byteLength(s, "utf8") > SLUG_MAX_BYTES) s = cutBytes(s, SLUG_MAX_BYTES).replace(/-+$/g, "");
  return WINDOWS_RESERVED.test(s) ? `${s}-game` : s;
}

/**
 * `slug()`가 낼 수 있는 모양인가 — 가져온 파일의 `mediaFolder`를 믿어도 되는지 본다.
 * 구분자·점·빈 문자열·예약 이름이 걸러진다 (`..`, `a/b`, `con`). 번호가 붙은 `이름-12`도 이 모양이다
 */
export function isSlugShaped(v: string): boolean {
  return v !== "" && Buffer.byteLength(v, "utf8") <= SLUG_MAX_BYTES + 24
    && /^[\p{Alphabetic}\p{Nd}]+(?:-[\p{Alphabetic}\p{Nd}]+)*$/u.test(v)
    && !/\p{M}/u.test(v) && v === v.normalize("NFC") && v === v.toLowerCase()
    && !WINDOWS_RESERVED.test(v);
}

/**
 * 주격 조사 — 받침이 있으면 `이`, 없으면 `가` (`구독이`·`태그가`).
 * 한글 음절이 아니면 받침을 알 수 없어 `가`
 */
export function subjectParticle(word: string): "이" | "가" {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? "이" : "가";
}
