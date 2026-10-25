/**
 * `starlog-media://` — 스크린샷 원본과 썸네일을 **메인 프로세스가 디스크에서 바로** 내준다.
 *
 *   starlog-media://shot/<게임 폴더>/<파일>?v=<원본 mtime ms>     원본 (영상은 Range)
 *   starlog-media://thumb/<게임 폴더>/<파일>?v=<원본 mtime ms>    썸네일 — 없으면 이 요청에서 만든다
 *
 * ## 왜 서버(http)가 아닌가 (2026-10-26 실측, 맥)
 *
 * - http/1.1은 출처당 **연결 6개**다. 썸네일 800장이 그 6개 앞에 줄을 서서 대기 중앙값이 2.1초였다
 * - 주소에 포트·토큰이 들어가 **다시 켜면 주소가 전부 바뀐다** — 같은 문서에서 다시 열어도 캐시를 하나도 못 썼다.
 *   여기 주소는 데이터 루트 안의 위치 + 원본 시각뿐이라 기동이 바뀌어도 같다
 * - 서버를 안 거치니 토큰도 필요 없다 — 대신 경로 검사가 전부 여기서 끝나야 한다 (아래)
 *
 * ## 경로 검사
 *
 * 주소 조각을 그대로 붙이지 않는다. 조각 둘(폴더·파일)만, 각 조각은 `media.isPlainSegment`(구분자·`..`·`:`·점으로 시작·끝의 점/공백 없음),
 * 붙인 경로는 **lstat으로 링크가 아닌 진짜 폴더·파일**이어야 하고, `realpath`가 `<데이터 루트>/media/<폴더>/<파일>` 한 칸 아래여야 한다
 * (`media.mediaFileInside` — 윈도우는 대소문자 무시). 확장자는 사진·영상 일곱 가지만, Content-Type도 확장자로 정한다.
 * 썸네일은 그 원본의 `.thumbs/<이름>.jpg`만 — `.thumbs`가 링크면 안 내준다. GET·HEAD만
 */
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { Readable } = require("stream");
const media = require("./media");
const thumbs = require("./thumbs");
const timing = require("./mediaTiming");

const SCHEME = "starlog-media";
/** registerSchemesAsPrivileged에 넣을 것. stream은 영상 Range 재생에 필요하다. fetch·CORS는 안 연다 — `<img>`·`<video>`만 쓴다 */
const PRIVILEGES = { standard: true, secure: true, stream: true };

const COMMON = {
  "x-content-type-options": "nosniff",
  // 주소에 원본 시각(`v`)이 있어 같은 주소면 같은 바이트다
  "cache-control": "private, max-age=31536000, immutable",
};

const notFound = () => new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });

/**
 * 주소 → `{ kind, source }` 또는 null. `source`는 검사를 마친 원본의 실제 경로.
 * `mediaRoot`는 지금 백엔드의 `<데이터 루트>/media` (세션이 없으면 null → 전부 404)
 */
function resolve(rawUrl, mediaRoot) {
  if (!mediaRoot) return null;
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== `${SCHEME}:` || (url.host !== "shot" && url.host !== "thumb")) return null;
  if (url.username || url.password || url.port) return null;
  const raw = url.pathname.split("/");
  if (raw.length !== 3 || raw[0] !== "") return null;
  let folder, name;
  try {
    folder = decodeURIComponent(raw[1]);
    name = decodeURIComponent(raw[2]);
  } catch {
    return null;
  }
  if (!media.isPlainSegment(folder) || !media.isPlainSegment(name) || media.kindOf(name) === null) return null;
  const candidate = path.join(mediaRoot, folder, name);
  try {
    // 링크가 아닌 진짜 폴더·파일 — 서버 목록(`localList`·`isRealDirectory`)과 같은 기준이다
    if (!fs.lstatSync(path.join(mediaRoot, folder)).isDirectory()) return null;
    if (!fs.lstatSync(candidate).isFile()) return null;
  } catch {
    return null;
  }
  const source = media.mediaFileInside(mediaRoot, candidate);
  if (!source) return null;
  return { kind: url.host, source, folder };
}

/** 썸네일 실물 — 원본의 `.thumbs/<이름>.jpg`, 링크 아님, 실제 경로도 그 폴더 안 */
function thumbFileOf(source) {
  const td = media.thumbDirOf(path.dirname(source));
  if (!td?.exists) return null;
  const file = media.thumbPathOf(source);
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    const real = media.realpath(file);
    const parts = media.partsInside(media.realpath(path.dirname(source)), real);
    if (!parts || parts.length !== 2 || !media.isThumbDirName(parts[0])) return null;
    return real;
  } catch {
    return null;
  }
}

/** `bytes=a-b` 하나만. 여러 구간·이상한 값은 null(→ 416) */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end };
}

async function serveFile(request, file, contentType) {
  const st = await fsp.stat(file);
  const headers = { ...COMMON, "content-type": contentType, "accept-ranges": "bytes" };
  const head = request.method === "HEAD";
  const range = request.headers.get("range");
  if (range) {
    const r = parseRange(range, st.size);
    if (!r) return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${st.size}` } });
    const length = r.end - r.start + 1;
    const h = { ...headers, "content-range": `bytes ${r.start}-${r.end}/${st.size}`, "content-length": String(length) };
    if (head) return new Response(null, { status: 206, headers: h });
    return new Response(Readable.toWeb(fs.createReadStream(file, { start: r.start, end: r.end })), { status: 206, headers: h });
  }
  headers["content-length"] = String(st.size);
  if (head) return new Response(null, { status: 200, headers });
  // 사진은 통째로 (수백 KB) — 흘려보내기보다 한 번에 읽는 쪽이 빠르다. 영상은 흘린다
  if (st.size <= 64 * 1024 * 1024 && contentType.startsWith("image/")) return new Response(await fsp.readFile(file), { status: 200, headers });
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers });
}

/**
 * @param getRoot   지금 세션의 `<데이터 루트>/media` (없으면 null)
 * @param onRequest 폴더 이름 — 배경 일이 "지금 화면이 보는 폴더"를 알고, 화면이 바쁠 때 물러나게
 */
function handler(getRoot, onRequest = () => {}) {
  return async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
    const t0 = performance.now();
    const target = resolve(request.url, getRoot());
    if (!target) return notFound();
    onRequest(target.folder, target.kind);
    try {
      if (target.kind === "shot") return await serveFile(request, target.source, media.contentTypeOf(target.source));
      const made = await thumbs.ensure(target.source, "high");
      const file = made && thumbFileOf(target.source);
      if (!file) return notFound();
      const res = await serveFile(request, file, "image/jpeg");
      timing.mark("protocol.thumb", { ms: Math.round(performance.now() - t0) });
      return res;
    } catch {
      return notFound();
    }
  };
}

module.exports = { SCHEME, PRIVILEGES, resolve, parseRange, thumbFileOf, handler };
