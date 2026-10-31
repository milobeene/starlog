/**
 * 스크린샷 썸네일 — `<게임 폴더>/.thumbs/<원본 이름>.jpg` (긴 변 480, JPEG 82) + 흐린 자리표시(LQIP) + 폴더 색인.
 *
 * ## 누가 부탁하나
 *
 * - 화면: `starlog-media://thumb/…` (`mediaProtocol.js`) — 없으면 그 요청에서 **높은 순위**로 만든다
 * - 서버: `{type: "thumbnail"}` 메시지 (업로드 직후·http `/thumb`) — 짝은 `server/src/common/storage/thumbs.ts`
 * - 배경: 세션을 열면 빠진 것을 **낮은 순위**로 (`mediaWork.js`)
 *
 * ## 순서 — 화면이 기다리는 쪽이 먼저
 *
 * 줄이 둘이다. 높은 순위는 슬롯을 다 쓸 수 있고, 낮은 순위는 2개까지만 — 배경 일이 슬롯을 다 차지해도
 * 화면이 부른 한 장은 **바로** 빈 슬롯에 들어간다. 파일 읽기는 따로 2개로 묶는다: 사용자 PC가 HDD라
 * 여러 파일을 동시에 읽으면 헤드가 오가며 오히려 느리다.
 *
 * ## 만드는 길
 *
 * 1. 사진(jpg·png·webp) → 공장(`thumbPool.js`, 워커에서 createImageBitmap). WebP도 여기서 풀린다
 * 2. 공장이 실패·없음 → `nativeImage.createFromPath`(메인, 예전 길) → 그래도 안 되면 OS 썸네일
 * 3. 영상 → OS 썸네일 (`createThumbnailFromPath` — 맥 QuickLook, 윈도우 셸 썸네일 캐시)
 *
 * **썸네일 수정시각에 원본 시각을 심는다** — 서버·여기가 그걸로 신선도를 본다.
 * 임시 파일에 쓰고 이름을 바꾼다 (반쯤 쓴 그림 방지). 윈도우는 백신이 막 쓴 파일을 쥐고 있어 rename을 몇 번 다시 한다
 */
const { nativeImage } = require("electron");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const media = require("./media");
const index = require("./mediaIndex");
const pool = require("./thumbPool");
const { imageInfo } = require("./imageInfo");
const timing = require("./mediaTiming");
const gate = require("./mediaGate");

/**
 * 어느 공장에 맡기나 — 화면이 부른 것이고 사용자가 STARLOG를 보고 있으면 빠른 공장(높은 OS 순위),
 * 아니면 느린 공장(낮은 OS 순위, 워커 2개). 게임 중에 보이는 그리드가 부르는 몇 장도 느린 쪽으로 간다
 */
const poolFor = (priority) => (priority !== "low" && gate.isActive() ? pool.fast : pool.slow);

const BOX = 480;
const JPEG_QUALITY = 82;
const SLOTS = pool.SIZE + 2;   // 읽는 동안 워커가 놀지 않게 조금 더
/** 배경 일은 워커 2개까지 — 나머지는 늘 화면 몫으로 비워 둔다 (게임과 함께 돌 때 CPU를 덜 먹게) */
const LOW_SLOTS = Math.min(2, Math.max(1, pool.SIZE - 1));
const READ_SLOTS = 2;
/** 한 장 전체(읽기 + 풀기 + 쓰기)의 끝. 서버는 20초 뒤 포기한다 */
const JOB_TIMEOUT_MS = 30_000;

// ───────────── 줄 ─────────────

const queues = { high: [], low: [] };
let active = 0;
let activeLow = 0;

function schedule(priority, job) {
  const item = { job, low: priority === "low" };
  item.promise = new Promise((resolve, reject) => { item.resolve = resolve; item.reject = reject; });
  queues[item.low ? "low" : "high"].push(item);
  pump();
  return item;
}

/** 배경 줄에서 기다리던 것을 화면이 불렀다 — 앞줄로 옮긴다 (이미 돌고 있으면 그대로 기다린다) */
function promote(item) {
  const at = queues.low.indexOf(item);
  if (at < 0) return;
  queues.low.splice(at, 1);
  item.low = false;
  queues.high.unshift(item);
  pump();
}

function pump() {
  while (active < SLOTS) {
    let item = queues.high.shift();
    if (!item && activeLow < LOW_SLOTS) item = queues.low.shift();
    if (!item) return;
    active++;
    if (item.low) activeLow++;
    withTimeout(Promise.resolve().then(() => item.job(item)), JOB_TIMEOUT_MS)
      .then(item.resolve, item.reject)
      .finally(() => { active--; if (item.low) activeLow--; pump(); });
  }
}

/** 배경 일을 버린다 (세션 바꿈·종료). 이미 도는 것은 끝까지 간다 — 반쯤 쓴 파일을 안 남기려고 */
function cancelLow() {
  const dropped = queues.low.splice(0);
  for (const d of dropped) d.resolve({ ok: false, canceled: true });
  return dropped.length;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("시간 초과")), ms); })])
    .finally(() => clearTimeout(timer));
}

const reads = { high: [], low: [] };
let reading = 0;
function readFile(file, priority) {
  return new Promise((resolve, reject) => {
    reads[priority === "low" ? "low" : "high"].push(() => fsp.readFile(file).then(resolve, reject).finally(() => { reading--; nextRead(); }));
    nextRead();
  });
}
function nextRead() {
  while (reading < READ_SLOTS) {
    const next = reads.high.shift() ?? reads.low.shift();
    if (!next) return;
    reading++;
    next();
  }
}

// ───────────── 신선도 ─────────────

const mtimeMsOf = (st) => st.mtimeNs / 1_000_000n;

/** 썸네일이 이 원본 판(`st`, bigint stat)의 것인가. 링크는 따라가지 않는다 — 그대로 서빙되는 파일이라 */
function isFresh(source, st) {
  const td = media.thumbDirOf(path.dirname(source));
  if (!td?.exists) return false;
  try {
    const t = fs.lstatSync(media.thumbPathOf(source), { bigint: true });
    // 1ms까지 봐준다 — 시각을 초 단위 부동소수로 심는 길(`utimes`)에서 끝자리가 밀릴 수 있다
    const diff = mtimeMsOf(t) - mtimeMsOf(st);
    return t.isFile() && t.size > 0n && diff >= -1n && diff <= 1n;
  } catch {
    return false;
  }
}

// ───────────── 만드는 길 ─────────────

function fit(image, box) {
  const { width, height } = image.getSize();
  if (!width || !height) return null;
  const scale = Math.min(1, box / Math.max(width, height));
  if (scale === 1) return image;
  return image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: "good" });
}

/** nativeImage에서 LQIP — 비트맵은 BGRA다 (맥·윈도우 Skia N32) */
function lqipOfNative(image) {
  const { width, height } = image.getSize();
  if (!width || !height) return null;
  const s = 8 / Math.max(width, height);
  const w = Math.max(1, Math.round(width * s)), h = Math.max(1, Math.round(height * s));
  const small = image.resize({ width: w, height: h, quality: "good" });
  const { width: sw, height: sh } = small.getSize();
  const px = small.toBitmap();
  if (px.length < sw * sh * 4) return null;
  const rgb = Buffer.alloc(sw * sh * 3);
  for (let i = 0, j = 0; i < sw * sh * 4; i += 4, j += 3) { rgb[j] = px[i + 2]; rgb[j + 1] = px[i + 1]; rgb[j + 2] = px[i]; }
  return `${sw}x${sh}:${rgb.toString("base64")}`;
}

/** QuickLook·윈도우 셸. 아이콘(모서리 투명)이 오면 null */
async function viaOs(file, box) {
  if (typeof nativeImage.createThumbnailFromPath !== "function") return null;   // 리눅스엔 없다
  const os = await nativeImage.createThumbnailFromPath(file, { width: box, height: box });
  // 표현이 여럿(1x·2x)이라 그대로는 크기를 못 믿는다 — PNG로 한 번 굳혀서 한 장으로 만든다
  const flat = nativeImage.createFromBuffer(os.toPNG());
  const { width, height } = flat.getSize();
  if (!width || !height) return null;
  const bitmap = flat.toBitmap();
  const alpha = (x, y) => bitmap[(y * width + x) * 4 + 3];
  if (alpha(0, 0) === 0 && alpha(width - 1, 0) === 0 && alpha(0, height - 1) === 0 && alpha(width - 1, height - 1) === 0) {
    return null;   // 파일 종류 아이콘
  }
  return flat;
}

/** 메인의 길 (공장이 없거나 실패했을 때, 영상) */
async function viaNative(source, kind, box) {
  let image = null;
  if (kind === "image") {
    const decoded = nativeImage.createFromPath(source);
    image = decoded.isEmpty() ? await viaOs(source, box) : decoded;   // WebP·깨진 파일은 OS에게
  } else {
    image = await viaOs(source, box);
  }
  const small = image && fit(image, box);
  if (!small) return null;
  const { width, height } = image.getSize();
  return { jpeg: small.toJPEG(JPEG_QUALITY), lq: lqipOfNative(small), w: kind === "image" ? width : null, h: kind === "image" ? height : null };
}

async function writeThumb(source, jpeg, st) {
  const td = media.thumbDirOf(path.dirname(source));
  /*
   * ⚠️ `.thumbs`가 **진짜 폴더**인지 lstat으로 본다 (보안 점검 2026-10-25). 누가 거기에 밖을 가리키는
   * 심볼릭 링크를 심어 두면 mkdir·쓰기가 링크를 따라가 데이터 루트 밖에 파일을 만든다
   */
  if (!td) return false;
  if (!td.exists) {
    try { fs.mkdirSync(td.dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
    if (!media.thumbDirOf(path.dirname(source))?.exists) return false;
  }
  const target = media.thumbPathOf(source);
  const tmp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    // wx — 같은 이름으로 심어 둔 링크가 있으면 따라가지 않고 실패한다
    await fsp.writeFile(tmp, jpeg, { flag: "wx" });
    const seconds = Number(st.mtimeNs) / 1e9;
    await fsp.utimes(tmp, Number(st.atimeNs) / 1e9, seconds);   // 신선도 표시
    for (let attempt = 0; ; attempt++) {
      try { await fsp.rename(tmp, target); break; } catch (e) {
        if (!["EPERM", "EBUSY", "EACCES"].includes(e.code) || attempt >= 5) throw e;
        await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
      }
    }
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  return true;
}

let made = 0;

/**
 * 한 장 만든다 (줄 안에서). `source`는 `mediaFileInside`를 지난 실제 경로여야 한다.
 * 결과는 색인에도 적는다 — 실패도 (`t: 0`) — 다음 기동에서도 깨진 파일을 다시 두드리지 않게
 */
async function produce(source, priority, ext = null) {
  const st = await fsp.stat(source, { bigint: true });
  const kind = media.kindOf(source);
  const t0 = performance.now();
  let out = null;
  let info = null;
  if (kind === "image") {
    const bytes = await readFile(source, priority);
    info = imageInfo(bytes);
    try {
      const direct = info && info.orientation === 1;
      const r = await poolFor(priority).run({
        mode: "thumb", bytes, type: media.contentTypeOf(source) ?? "", box: BOX, q: JPEG_QUALITY / 100,
        w: direct ? info.width : 0, h: direct ? info.height : 0,
      });
      out = { jpeg: r.jpeg, lq: r.lq, w: info?.width ?? null, h: info?.height ?? null };
    } catch {
      out = null;   // 깨진 파일·공장 문제 → 예전 길로 한 번 더
    }
  }
  if (!out) {
    try { out = await viaNative(source, kind, BOX); } catch { out = null; }
  }
  const folder = path.dirname(source), name = path.basename(source);
  const base = { m: st.mtimeNs.toString(), s: Number(st.size) };
  if (!out?.jpeg) {
    // 풀 수 없는 파일 — 이 판은 다시 안 두드린다
    const failed = { ...base, w: info?.width ?? null, h: info?.height ?? null, p: null, t: 0 };
    if (ext) ext.put(failed); else index.put(folder, name, failed);
    return { ok: false };
  }
  // 못 쓴 건 파일 탓이 아니다 (`.thumbs`가 링크 등) — "못 만듦"으로 적지 않는다
  // `ext`는 등록한 외부 폴더의 파일 — 썸네일을 사용자 폴더가 아니라 앱 캐시에 쓴다 (`extMedia.js`)
  if (!(ext ? await ext.write(out.jpeg, st) : await writeThumb(source, out.jpeg, st))) return { ok: false };
  const made1 = { ...base, w: out.w ?? null, h: out.h ?? null, p: out.lq ?? null, t: 1 };
  if (ext) ext.put(made1); else index.put(folder, name, made1);
  made++;
  timing.mark("thumb", { ms: Math.round(performance.now() - t0), priority, kind });
  return { ok: true };
}

/**
 * 썸네일은 있는데 자리표시가 없는 것 (이 기능 전에 만든 썸네일) — 원본을 다시 풀지 않고 **썸네일**에서 뽑는다.
 * 크기는 원본 머리글(앞 64KB)에서
 */
async function produceLqip(source, priority) {
  const st = await fsp.stat(source, { bigint: true });
  const thumb = await readFile(media.thumbPathOf(source), priority);
  let head = null;
  if (media.kindOf(source) === "image") {
    const fh = await fsp.open(source, "r");
    try {
      const buf = Buffer.alloc(65536);
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      head = imageInfo(buf.subarray(0, bytesRead));
    } finally { await fh.close(); }
  }
  let lq = null;
  try { lq = (await poolFor(priority).run({ mode: "lqip", bytes: thumb, type: "image/jpeg", box: BOX, q: 0, w: 0, h: 0 })).lq; } catch {
    lq = lqipOfNative(nativeImage.createFromBuffer(thumb));
  }
  index.put(path.dirname(source), path.basename(source),
    { m: st.mtimeNs.toString(), s: Number(st.size), w: head?.width ?? null, h: head?.height ?? null, p: lq, t: 1 });
  return { ok: true };
}

const inflight = new Map();

/**
 * 같은 원본을 동시에 여러 번 부르면 한 번만 만든다 (그리드 + 업로드 직후 + 배경이 겹칠 때).
 * 배경 줄에서 기다리던 것을 화면이 부르면 앞줄로 옮긴다
 */
function generate(source, { priority = "high", lqipOnly = false, ext = null } = {}) {
  const key = `${source}\0${lqipOnly ? "l" : "t"}\0${ext?.key ?? ""}`;
  const running = inflight.get(key);
  if (running) {
    if (priority !== "low") promote(running);
    return running.promise;
  }
  // 순위는 돌기 시작할 때 다시 읽는다 — 기다리는 사이 화면이 불러 앞줄로 옮겨졌을 수 있다
  const item = schedule(priority, (it) => {
    const now = it.low ? "low" : "high";
    return lqipOnly ? produceLqip(source, now) : produce(source, now, ext);
  });
  item.promise = item.promise
    .catch((e) => { console.warn("썸네일 실패", source, e?.message ?? e); return { ok: false }; })
    .finally(() => { if (inflight.get(key) === item) inflight.delete(key); });
  inflight.set(key, item);
  return item.promise;
}

/**
 * 화면이 부른 썸네일 — 신선하면 그 경로, 아니면 만들어서. 못 만들면 null.
 * 이 판이 이미 "못 만듦"(색인 `t: 0`)이면 다시 안 두드린다
 */
async function ensure(source, priority = "high") {
  const st = fs.statSync(source, { bigint: true });
  if (isFresh(source, st)) return media.thumbPathOf(source);
  const known = index.get(path.dirname(source), path.basename(source));
  if (known && known.t === 0 && known.m === st.mtimeNs.toString() && known.s === Number(st.size)) return null;
  const r = await generate(source, { priority });
  if (!r.ok) return null;
  return isFresh(source, fs.statSync(source, { bigint: true })) ? media.thumbPathOf(source) : null;
}

/** 외부 폴더 파일의 썸네일 — `ext`(`extMedia.target`)의 캐시에. 신선하면 그 경로, 못 만들면 null */
async function ensureExternal(source, ext, priority = "high") {
  const st = fs.statSync(source, { bigint: true });
  if (ext.fresh(st)) return ext.file;
  const known = ext.get();
  if (known && known.t === 0 && known.m === st.mtimeNs.toString() && known.s === Number(st.size)) return null;
  const r = await generate(source, { priority, ext });
  if (!r.ok) return null;
  return ext.fresh(fs.statSync(source, { bigint: true })) ? ext.file : null;
}

/** 예전 모양 그대로 — `{source, max}`를 받아 성공 여부 (E2E·서버 메시지) */
async function makeThumbnail(request, mediaRoot) {
  const source = media.mediaFileInside(mediaRoot, request?.source);
  if (!source) return false;
  return (await generate(source, { priority: "high" })).ok;
}

/** 서버 메시지 하나 처리. `reply`는 서버로 보내는 함수 */
function handleServerMessage(message, mediaRoot, reply) {
  if (message?.type !== "thumbnail" || typeof message.id !== "string") return false;
  makeThumbnail(message, mediaRoot).then((ok) => {
    try { reply({ type: "thumbnail:result", id: message.id, ok }); } catch { /* 서버가 그새 내려갔다 */ }
  });
  return true;
}

module.exports = {
  BOX, isFresh, generate, ensure, ensureExternal, makeThumbnail, handleServerMessage, cancelLow,
  stats: () => ({ made, active, queuedHigh: queues.high.length, queuedLow: queues.low.length }),
};
