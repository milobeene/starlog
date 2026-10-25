/**
 * 정적 화면의 Content-Security-Policy — `desktop/csp.js`와 **같은 정책**이다 (한 벌을 두 곳이 서빙한다).
 *
 * 인라인 `<script>`는 Next 정적 내보내기가 넣는 RSC 페이로드 둘(`self.__next_f.push(...)`)뿐이다.
 * `'unsafe-inline'` 대신 **보내는 바로 그 바이트의 해시**를 단다 — 빌드 때 따로 목록을 만들면
 * 빌드를 다시 돌리고 목록을 안 고친 판에서 검은 화면이 난다. 서빙할 때 재면 어긋날 수가 없다
 */
import crypto from "crypto";
import { config } from "../config";

const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;

export function inlineScriptHashes(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(INLINE_SCRIPT)) {
    if (m[1] === "") continue;
    out.add(`'sha256-${crypto.createHash("sha256").update(m[1]!, "utf8").digest("base64")}'`);
  }
  return [...out];
}

/** http(s) 주소의 출처만. 이상한 값(`;`·공백이 섞인 것)이 정책에 끼어들지 못하게 URL로 한 번 거른다 */
export function originOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp(opts: { scriptHashes: string[]; imgOrigins: string[]; connectOrigins: string[] }): string {
  const list = (...xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].join(" ");
  return [
    "default-src 'self'",
    `script-src ${list("'self'", ...opts.scriptHashes)}`,
    // 인라인 style 속성·<style>이 내보낸 HTML에 없다. React의 style={...}은 CSSOM으로 들어가 CSP 대상이 아니다
    "style-src 'self'",
    // 커버: IGDB · 로컬 서버(LOCAL 커버·스크린샷·썸네일) · 스토리지 공개 주소(EXTERNAL 커버)
    `img-src ${list("'self'", "data:", "blob:", "https://images.igdb.com", "http://127.0.0.1:*", ...opts.imgOrigins)}`,
    "media-src 'self' blob: http://127.0.0.1:*",
    // 스토리지 엔드포인트 — EXTERNAL 커버는 브라우저가 서명된 주소로 직접 PUT한다
    `connect-src ${list("'self'", "http://127.0.0.1:*", ...opts.connectOrigins)}`,
    "font-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** 이 서버가 붙은 스토리지 기준 — 서버는 자기 설정을 안다 */
export function cspForHtml(html: string): string {
  const s = config().storage;
  return buildCsp({
    scriptHashes: inlineScriptHashes(html),
    imgOrigins: [originOf(s.publicBaseUrl)].filter((x): x is string => !!x),
    connectOrigins: [originOf(s.endpoint)].filter((x): x is string => !!x),
  });
}
