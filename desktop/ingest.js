/**
 * 스크린샷 넣기(ingest) — **파일을 경로로 받아 메인이 복사한다** (2.1.0).
 *
 * 예전엔 화면이 파일을 한 장씩 HTTP로 올렸고, 첫 실패에서 멈춰 나머지가 조용히 안 올라갔다(4K PNG가 20MB를 넘던 날).
 * 이제 메인이 `<게임>/.incoming/<batchId>/`로 스트림 복사 → 크기·sha256 검증 → 서버 커밋(번호는 서버가 정한다).
 * **전부 아니면 전혀**: 어느 단계든 실패하면 묶음 폴더를 통째로 지우고 `rolledBack`. 원본은 건드리지 않는다.
 *
 * 상태는 여기(메인)에 있다 — 화면이 상세를 떠났다 와도 `status()`로 다시 본다.
 * 같은 게임 폴더는 한 번에 한 묶음 (HDD에서 두 복사가 엉키지 않게, 번호 경합도 서버가 어차피 직렬로 처리한다)
 */
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const media = require("./media");

const INCOMING = ".incoming";
const SAFETY_MARGIN = 512 * 1024 ** 2;
const EMIT_MS = 200;       // 진행 알림은 초당 5번까지
const MAX_SOURCES = 5000;
const KEEP_FINISHED = 50;
const STALE_MS = 60 * 60 * 1000;
const BATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WIN = process.platform === "win32";

/** @type {Map<string, object>} */
const jobs = new Map();
/** 폴더 → 줄 끝 */
const lanes = new Map();
let resolveChain = Promise.resolve();
let ctx = null;   // { getBackend, postJson, send, onCommitted }

function init(c) { ctx = c; }

const running = (j) => j.phase === "copying" || j.phase === "verifying" || j.phase === "committing";
const snapshot = (j) => ({
  batchId: j.batchId, entryId: j.entryId, phase: j.phase, done: j.done, total: j.total,
  bytesDone: j.bytesDone, bytesTotal: j.bytesTotal, committed: [...j.committed],
  failures: j.failures.map((f) => ({ ...f })), message: j.message,
});

function emit(job, force) {
  const now = Date.now();
  if (!force && now - job.lastEmit < EMIT_MS) return;
  job.lastEmit = now;
  try { ctx?.send("media:ingest", snapshot(job)); } catch { /* 창이 없다 — 상태는 남아 있다 */ }
}

function prune() {
  const finished = [...jobs.values()].filter((j) => !running(j));
  for (const j of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED))) jobs.delete(j.batchId);
}

function status() { return [...jobs.values()].map(snapshot); }

/** 사유를 사람 말로 */
function reasonOf(e) {
  switch (e?.code) {
    case "ENOENT": return "원본이 없어졌습니다";
    case "EACCES": case "EPERM": return "읽을 수 없습니다 (권한)";
    case "EBUSY": return "다른 프로그램이 쓰는 중입니다";
    case "ENOSPC": return "저장 공간이 부족합니다";
    case "EISDIR": return "폴더입니다";
    default: return String(e?.message ?? e);
  }
}

class SourceError extends Error {
  constructor(source, reason) { super(reason); this.source = source; this.reason = reason; }
}

const fmtBytes = (n) => {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)}${u[i]}`;
};

/** 남은 공간. 시험은 환경변수로 박는다 */
async function freeBytesOf(dir) {
  const forced = process.env.STARLOG_INGEST_FREE_BYTES;
  if (forced !== undefined && forced !== "") return Number(forced);
  const st = await fsp.statfs(dir);
  return Number(st.bavail) * Number(st.bsize);
}

// ───────────── 요청 검사 ─────────────

/**
 * 원본 하나. 절대 경로 · 실제 파일(링크는 따라간 결과) · 허용 확장자. 폴더는 안 받는다
 * @returns {{source, real, size, mtime, ext}}
 */
function inspect(source) {
  if (typeof source !== "string" || source === "" || source.includes("\0") || !path.isAbsolute(source)) {
    throw new SourceError(String(source), "경로가 올바르지 않습니다");
  }
  if (media.kindOf(source) === null) throw new SourceError(source, "지원하지 않는 형식입니다");
  let st, real;
  try {
    real = media.realpath(source);
    st = fs.statSync(real);
  } catch (e) { throw new SourceError(source, reasonOf(e)); }
  if (st.isDirectory()) throw new SourceError(source, "폴더는 넣을 수 없습니다");
  if (!st.isFile()) throw new SourceError(source, "파일이 아닙니다");
  // mtimeMs는 소수(APFS·NTFS 서브밀리초)라 Date(정수 ms)와 비교하면 거의 늘 달라진다 — 비교는 mtimeMs끼리
  return { source, real, size: st.size, mtime: st.mtime, mtimeMs: st.mtimeMs, ext: path.extname(source).toLowerCase() };
}

/**
 * @param {{entryId:number, sources:string[], takenAt?:Record<string,number>}} req
 * @returns {Promise<{batchId:string}>}
 */
async function start(req) {
  const entryId = req?.entryId;
  if (!Number.isSafeInteger(entryId) || entryId <= 0) throw new Error("잘못된 항목입니다");
  if (!Array.isArray(req.sources) || req.sources.length === 0 || req.sources.length > MAX_SOURCES) {
    throw new Error("넣을 파일이 없거나 너무 많습니다");
  }
  const takenAt = req.takenAt && typeof req.takenAt === "object" ? req.takenAt : {};
  const batchId = crypto.randomUUID();
  const job = {
    batchId, entryId, phase: "copying", done: 0, total: 0, bytesDone: 0, bytesTotal: 0,
    committed: [], failures: [], message: "준비 중", lastEmit: 0,
  };

  // 검사 — 틀린 게 하나라도 있으면 하나도 안 복사한다 (failed). 같은 파일이 두 번이면 한 번으로
  const items = [], seen = new Set(), bad = [];
  for (const s of req.sources) {
    try {
      const it = inspect(s);
      const key = WIN ? it.real.toLowerCase() : it.real;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = takenAt[s];
      it.takenMs = Number.isFinite(t) && t > 0 ? t : null;
      items.push(it);
    } catch (e) {
      bad.push(e instanceof SourceError ? { source: e.source, reason: e.reason } : { source: String(s), reason: reasonOf(e) });
    }
  }
  job.total = items.length + bad.length;
  job.bytesTotal = items.reduce((a, b) => a + b.size, 0);
  jobs.set(batchId, job);
  prune();
  if (bad.length > 0) {
    job.phase = "failed";
    job.failures = bad;
    job.message = "넣을 수 없는 파일이 있어 아무것도 넣지 않았습니다";
    emit(job, true);
    return { batchId };
  }
  emit(job, true);
  // 묶음끼리 순서를 지키려면 폴더를 정하는 것부터 줄을 세운다
  resolveChain = resolveChain.then(() => enqueue(job, items)).catch(() => {});
  return { batchId };
}

async function enqueue(job, items) {
  let folder;
  try {
    folder = await resolveFolder(job.entryId);
  } catch (e) {
    return fail(job, "failed", [], `게임 폴더를 정하지 못했습니다: ${reasonOf(e)}`);
  }
  const tail = lanes.get(folder);
  if (tail) {
    job.message = "앞의 묶음이 끝나길 기다리는 중";
    emit(job, true);
  }
  job.folder = folder;
  const mine = (tail ?? Promise.resolve()).then(() => run(job, items, folder))
    .catch((e) => console.error("[ingest] 예기치 않은 실패", e));
  lanes.set(folder, mine);
  mine.then(() => { if (lanes.get(folder) === mine) lanes.delete(folder); });
}

/** 서버가 정한 폴더 — 이미 있는 엔드포인트가 폴더를 만들고 `media_folder`를 적는다(트랜잭션은 서버 안) */
async function resolveFolder(entryId) {
  const { port, mediaRoot } = ctx.getBackend();
  if (!port || !mediaRoot) throw new Error("서버가 떠 있지 않습니다");
  const { path: reported } = await ctx.postJson(port, `/api/backlog/${entryId}/screenshots/folder`, {});
  // 서버가 준 경로라도 media/<게임> 한 칸인지 다시 본다
  const root = media.realpath(mediaRoot);
  const real = media.realpath(reported);
  const parts = media.partsInside(root, real);
  if (!parts || parts.length !== 1 || parts[0].startsWith(".")) throw new Error("게임 폴더가 데이터 루트 밖입니다");
  return real;
}

// ───────────── 한 묶음 ─────────────

function fail(job, phase, failures, message) {
  job.phase = phase;
  job.failures = failures;
  job.message = message;
  job.bytesDone = Math.min(job.bytesDone, job.bytesTotal);
  emit(job, true);
}

/** 윈도우는 백신이 막 쓴 파일을 잠깐 쥐어 지우기가 EBUSY·EPERM으로 실패한다 — 몇 번 다시 */
async function removeBatch(folder, batchId) {
  const dir = path.join(folder, INCOMING, batchId);
  for (let i = 0; i < 6; i++) {
    try {
      await fsp.rm(dir, { recursive: true, force: true });
      break;
    } catch (e) {
      if (i === 5) console.error("[ingest] 묶음 폴더를 못 지웠다", e?.code);
      else await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
  try { await fsp.rmdir(path.join(folder, INCOMING)); } catch { /* 다른 묶음이 있거나 이미 없다 */ }
}

async function run(job, items, folder) {
  const dir = path.join(folder, INCOMING, job.batchId);
  job.message = null;
  try {
    // 공간 — 복사하기 전에. 원본이 같은 드라이브면 복사본만큼 더 든다
    const free = await freeBytesOf(folder);
    if (job.bytesTotal > free - SAFETY_MARGIN) {
      return fail(job, "failed", [], `공간 부족: 필요 ${fmtBytes(job.bytesTotal)} / 남음 ${fmtBytes(Math.max(0, free))}`);
    }
    await fsp.mkdir(dir, { recursive: true });
    emit(job, true);

    // 복사 — 하나씩 (HDD에서 동시에 읽으면 오히려 느리다). 이름은 원본 순서 번호 + 확장자
    const hashes = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const dest = path.join(dir, `${String(i).padStart(4, "0")}${it.ext}`);
      try {
        hashes.push(await copyOne(job, it, dest));
      } catch (e) {
        throw e instanceof SourceError ? e : new SourceError(it.source, reasonOf(e));
      }
      job.done = i + 1;
      emit(job, true);
    }

    // 검증 — 복사본을 다시 읽어 해시가 같은지 (복사 중 읽은 원본의 해시와)
    job.phase = "verifying";
    job.done = 0;
    emit(job, true);
    for (let i = 0; i < items.length; i++) {
      const dest = path.join(dir, `${String(i).padStart(4, "0")}${items[i].ext}`);
      let ok = false;
      try {
        const st = await fsp.stat(dest);
        ok = st.size === hashes[i].size && (await sha256(dest)) === hashes[i].sha;
      } catch (e) { throw new SourceError(items[i].source, reasonOf(e)); }
      if (!ok) throw new SourceError(items[i].source, "복사본이 원본과 다릅니다");
      job.done = i + 1;
      emit(job);
    }

    // 서버 커밋 — 번호 붙이고 제자리로. 실패하면 서버가 되돌리고 500을 준다
    job.phase = "committing";
    emit(job, true);
    let result;
    try {
      const { port } = ctx.getBackend();
      result = await ctx.postJson(port, `/api/backlog/${job.entryId}/screenshots/commit`, { batchId: job.batchId });
    } catch (e) {
      throw new SourceError("", serverMessage(e));
    }
    job.committed = (result?.files ?? []).map((f) => f.fileName);
    job.phase = "done";
    job.done = job.total;
    job.bytesDone = job.bytesTotal;
    emit(job, true);
    await removeBatch(folder, job.batchId);
    try { ctx.onCommitted?.(folder); } catch { /* 알림일 뿐 */ }
  } catch (e) {
    await removeBatch(folder, job.batchId);
    const failures = e instanceof SourceError && e.source ? [{ source: e.source, reason: e.reason }] : [];
    const msg = e instanceof SourceError ? (e.source ? "넣지 못해 전부 되돌렸습니다" : `서버가 받지 못해 전부 되돌렸습니다: ${e.reason}`)
      : `넣지 못해 전부 되돌렸습니다: ${reasonOf(e)}`;
    fail(job, "rolledBack", failures, msg);
  }
}

function serverMessage(e) {
  const m = /→ \d+ (.*)$/s.exec(String(e?.message ?? ""));
  if (m) { try { const j = JSON.parse(m[1]); if (j.message) return j.message; } catch { /* 본문이 JSON이 아니다 */ } }
  return String(e?.message ?? e);
}

/** 스트림 복사 + 읽으면서 해시. 끝나면 mtime을 심고, 원본이 복사 중에 바뀌지 않았는지 본다 */
async function copyOne(job, it, dest) {
  const hash = crypto.createHash("sha256");
  let copied = 0;
  const src = fs.createReadStream(it.real, { highWaterMark: 1024 * 1024 });
  src.on("data", (chunk) => {
    hash.update(chunk);
    copied += chunk.length;
    job.bytesDone += chunk.length;
    emit(job);
  });
  await pipeline(src, fs.createWriteStream(dest, { flags: "wx" }));
  // 디스크까지 내려갔는지 — 정전에 빈 파일이 남지 않게
  const fh = await fsp.open(dest, "r+");
  try { await fh.sync(); } finally { await fh.close(); }
  const after = await fsp.stat(it.real);
  if (after.size !== it.size || copied !== it.size || after.mtimeMs !== it.mtimeMs) {
    throw new SourceError(it.source, "복사하는 동안 원본이 바뀌었습니다");
  }
  // "찍은 시각" — 화면이 준 값(브라우저가 읽은 원본 시각) 우선, 없으면 원본 mtime
  const when = it.takenMs !== null ? new Date(it.takenMs) : it.mtime;
  await fsp.utimes(dest, new Date(), when);
  return { sha: hash.digest("hex"), size: copied };
}

async function sha256(file) {
  const h = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file, { highWaterMark: 1024 * 1024 }), h);
  return h.digest("hex");
}

// ───────────── 쓰다 만 묶음 ─────────────

/** 세션을 열 때 — 한 시간 넘은 `.incoming/*` (비정상 종료가 남긴 것). 돌고 있는 묶음은 건드리지 않는다 */
function sweepStale(mediaRoot) {
  let removed = 0;
  let games;
  try { games = fs.readdirSync(mediaRoot, { withFileTypes: true }); } catch { return 0; }
  const active = new Set([...jobs.values()].filter(running).map((j) => j.batchId));
  const now = Date.now();
  for (const g of games) {
    if (!g.isDirectory() || g.name.startsWith(".")) continue;
    const root = path.join(mediaRoot, g.name, INCOMING);
    let names;
    try { if (!fs.lstatSync(root).isDirectory()) continue; names = fs.readdirSync(root); } catch { continue; }
    for (const b of names) {
      if (active.has(b)) continue;
      const dir = path.join(root, b);
      try {
        if (now - fs.lstatSync(dir).mtimeMs < STALE_MS) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        removed++;
      } catch { /* 다음 기회에 */ }
    }
    try { fs.rmdirSync(root); } catch { /* 안 비었다 */ }
  }
  return removed;
}

// ───────────── 드라이브 ─────────────

/** 같은 장치(dev)인 가장 위 폴더 — 맥의 마운트 지점. 윈도우는 `D:\` */
function mountRootOf(p) {
  if (WIN) return path.parse(p).root;
  let cur = p;
  const dev = fs.statSync(cur).dev;
  for (;;) {
    const up = path.dirname(cur);
    if (up === cur) return cur;
    try { if (fs.statSync(up).dev !== dev) return cur; } catch { return cur; }
    cur = up;
  }
}

/** 미디어 폴더가 있는 드라이브. 폴더가 아직 없으면 있는 가장 가까운 윗 폴더로 */
async function driveInfo(mediaDir, label) {
  let probe = path.resolve(mediaDir);
  while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const real = media.realpath(probe);
  const st = await fsp.statfs(real);
  return {
    root: mountRootOf(real),
    label: label ?? null,
    freeBytes: Number(st.bavail) * Number(st.bsize),
    totalBytes: Number(st.blocks) * Number(st.bsize),
  };
}

module.exports = { init, start, status, sweepStale, driveInfo, INCOMING, BATCH_ID };
