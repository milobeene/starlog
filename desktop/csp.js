/**
 * `app://starlog` 문서의 Content-Security-Policy — `server/src/http/csp.ts`와 **같은 정책**이다.
 *
 * 인라인 `<script>`(Next의 RSC 페이로드)는 서빙하는 바로 그 바이트의 해시로 연다 — 이유는 서버 쪽 주석.
 *
 * ## 스토리지 출처는 "저장된 연결 전부"로 연다
 *
 * 창은 평생 문서 한 장이라(입구 → 본 앱이 같은 문서 안의 라우팅) **문서를 받을 때는 어느 연결로 들어갈지 모른다.**
 * 그래서 저장된 연결의 엔드포인트·공개 주소를 전부 넣고, 문서를 받은 뒤에 연결을 새로 만들거나 주소를 바꾼 경우만
 * 기동 결과에 `reload`를 실어 문서를 한 번 새로 받게 한다 (`main.js` launch·session:resume)
 */
const crypto = require("crypto");

const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;

function inlineScriptHashes(html) {
  const out = new Set();
  for (const m of html.matchAll(INLINE_SCRIPT)) {
    if (m[1] === "") continue;
    out.add(`'sha256-${crypto.createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  }
  return [...out];
}

/** http(s) 주소의 출처만. 연결 설정은 사람이 친 값이라 `;`·공백이 정책에 끼어들지 못하게 URL로 거른다 */
function originOf(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** 연결 설정(들)의 스토리지 출처 — `{ img: 공개 주소들, connect: 엔드포인트들 }` */
function storageOrigins(storages) {
  const img = new Set();
  const connect = new Set();
  for (const s of storages) {
    const pub = originOf(s?.publicBaseUrl);
    const end = originOf(s?.endpoint);
    if (pub) img.add(pub);
    if (end) connect.add(end);
  }
  return { img: [...img], connect: [...connect] };
}

function buildCsp({ scriptHashes, imgOrigins, connectOrigins }) {
  const list = (...xs) => [...new Set(xs.filter(Boolean))].join(" ");
  return [
    "default-src 'self'",
    `script-src ${list("'self'", ...scriptHashes)}`,
    "style-src 'self'",
    `img-src ${list("'self'", "data:", "blob:", "https://images.igdb.com", "http://127.0.0.1:*", ...imgOrigins)}`,
    "media-src 'self' blob: http://127.0.0.1:*",
    `connect-src ${list("'self'", "http://127.0.0.1:*", ...connectOrigins)}`,
    "font-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** `want`의 출처가 전부 `have` 안에 있나 — 아니면 지금 문서로는 그 연결의 커버가 막힌다 */
function covers(have, want) {
  return want.img.every((o) => have.img.includes(o)) && want.connect.every((o) => have.connect.includes(o));
}

module.exports = { inlineScriptHashes, originOf, storageOrigins, buildCsp, covers };
