/**
 * 세션이 열려 있는 동안 뒤에서 도는 스크린샷 일 — **배경 썸네일 · 폴더 감시 · 파일 캐시 데우기**.
 * `start`는 기동 성공·복귀 때, `stop`은 서버를 내릴 때·앱을 끌 때 (`main.js`).
 *
 * ## 배경 썸네일
 *
 * 세션을 열고 잠깐 뒤(첫 화면이 먼저) 모든 게임 폴더를 훑어 빠지거나 낡은 썸네일을 **낮은 순위**로 만든다 —
 * 화면이 부른 것(높은 순위)이 늘 먼저다 (`thumbs.js`의 줄). 훑는 김에 폴더 색인(`mediaIndex.js`)을 맞추고 도장을 찍는다.
 * 진행은 화면의 알림으로 (`썸네일 준비 중 n/total`) — 20장 미만이면 조용히 한다 (매번 뜨면 소음이다).
 *
 * ## 감시
 *
 * 데이터 루트의 `media/`를 통째로 하나 감시한다 (윈도우·맥은 OS가 하위 폴더까지 알려준다). 사람이 탐색기로 넣은 파일을
 * 0.4초 모아서 그 폴더만 다시 훑고, 화면에 "바뀌었다"를 알린 뒤 썸네일을 만든다. `.thumbs` 안의 변화(우리가 쓰는 것)는 무시한다.
 * ⚠️ 윈도우는 감시하던 폴더가 지워지면 `EPERM` 오류를 낸다 — 닫고 잠시 뒤 다시 붙는다
 *
 * ## 파일 캐시 데우기
 *
 * 한가할 때 원본을 **읽기만** 한다 (풀지 않는다). HDD에서 처음 여는 원본은 탐색·백신 검사로 수십 ms가 드는데,
 * 한 번 읽어 두면 OS 캐시(사용자 PC 32GB)에서 나온다. 화면이 보고 있는 폴더 먼저, 그다음 전체를 아주 천천히.
 * 화면이 파일을 부르는 중(0.3초 안)이면 멈춰 기다린다
 */
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const media = require("./media");
const index = require("./mediaIndex");
const thumbs = require("./thumbs");
const pool = require("./thumbPool");
const timing = require("./mediaTiming");
const gate = require("./mediaGate");

const START_DELAY_MS = 1500;
const WATCH_DEBOUNCE_MS = 400;
const QUIET_MS = 300;
const PROGRESS_MIN = 20;
/** 배경 썸네일 줄 수 (워커 2개까지) · 한 장마다 쉬는 시간 — 게임과 함께 돌 때 CPU를 몰아 쓰지 않게 */
const PREGEN_LANES = 2;
const PREGEN_YIELD_MS = 15;
/** 데우기 한도 — 메모리의 1/8, 최대 2GB */
const WARM_BUDGET = Math.min(2 * 1024 ** 3, Math.floor(os.totalmem() / 8));

let run = null;   // 지금 세션 — { root, gen, canceled, ... }
let gen = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isMediaName = (n) => !n.startsWith(".") && media.kindOf(n) !== null;

/** 게임 폴더들 — 링크가 아닌 진짜 폴더, 점으로 시작하지 않는 것. 최근에 바뀐 폴더 먼저 */
function gameFolders(root) {
  let names;
  try { names = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const d of names) {
    if (!d.isDirectory() || d.name.startsWith(".")) continue;
    const dir = path.join(root, d.name);
    try { out.push({ dir, m: fs.lstatSync(dir).mtimeMs }); } catch { /* 그새 사라짐 */ }
  }
  return out.sort((a, b) => b.m - a.m).map((x) => x.dir);
}

/**
 * 폴더 하나 훑기 — stat으로 색인을 맞추고, 만들 일을 돌려준다. 파일을 열지 않는다.
 * 훑기 전후로 폴더 mtime이 같을 때만 도장을 찍는다 (그 사이 바뀌었으면 다음 훑기가 찍는다)
 * @returns {{ work: {source, lqipOnly}[], changed: boolean }}
 */
async function scan(folder, current) {
  let before;
  try { before = await fsp.lstat(folder, { bigint: true }); } catch { return { work: [], changed: false }; }
  if (!before.isDirectory()) return { work: [], changed: false };
  let names = await fsp.readdir(folder);
  // 미디어가 하나도 없으면 `.thumbs`는 낡은 찌꺼기다 — 색인이 남으면 없는 사진이 목록에 비칠 수 있다. 진짜 폴더일 때만 치운다
  if (!names.some(isMediaName)) {
    index.drop(folder);
    const td = media.thumbDirOf(folder);
    if (td?.exists) { try { await fsp.rm(td.dir, { recursive: true, force: true }); } catch { /* 다음 훑기에 */ } }
    return { work: [], changed: false };
  }
  // `.thumbs`를 먼저 만든다 — 훑는 중에 생기면 폴더 mtime이 바뀌어 도장이 안 찍힌다
  if (names.some(isMediaName) && !names.some((n) => media.isThumbDirName(n))) {
    try {
      await fsp.mkdir(path.join(folder, media.THUMB_DIR));
      before = await fsp.lstat(folder, { bigint: true });
      names = await fsp.readdir(folder);
    } catch { /* 못 만들면 썸네일도 못 쓴다 — 도장 없이 간다 */ }
  }
  const old = index.files(folder);
  const files = {};
  const work = [];
  let changed = false;
  for (const name of names) {
    if (current?.canceled) return { work: [], changed: false };
    if (!isMediaName(name)) continue;
    const source = path.join(folder, name);
    let st;
    try { st = await fsp.lstat(source, { bigint: true }); } catch { continue; }
    if (!st.isFile()) continue;   // 링크·폴더는 서버도 안 내준다
    const m = st.mtimeNs.toString(), s = Number(st.size);
    const prev = old[name];
    const same = prev && prev.m === m && prev.s === s;
    if (!same) changed = true;
    const entry = same ? { ...prev } : { m, s, w: null, h: null, p: null };
    const fresh = thumbs.isFresh(source, st);
    if (fresh) {
      entry.t = 1;
      if (!entry.p) work.push({ source, lqipOnly: true });
    } else if (same && prev.t === 0) {
      entry.t = 0;   // 이 판은 못 만든다 — 다시 안 두드린다
    } else {
      delete entry.t;
      work.push({ source, lqipOnly: false });
    }
    files[name] = entry;
  }
  if (Object.keys(old).some((n) => !(n in files))) changed = true;
  pruneOrphans(folder, files);
  let after = null;
  try { after = await fsp.lstat(folder, { bigint: true }); } catch { /* 사라짐 */ }
  const stamp = after && after.mtimeNs === before.mtimeNs ? { m: before.mtimeNs.toString(), n: names.length } : null;
  index.replace(folder, files, stamp);
  return { work, changed };
}

/** 원본이 사라진 썸네일 — 서버도 목록을 읽을 때 치우지만, 도장이 있으면 서버가 안 들여다본다 */
function pruneOrphans(folder, files) {
  const td = media.thumbDirOf(folder);
  if (!td?.exists) return;
  let entries;
  try { entries = fs.readdirSync(td.dir); } catch { return; }
  for (const n of entries) {
    if (!n.endsWith(".jpg")) continue;
    const src = n.slice(0, -4);
    if (!(src in files) && !fs.existsSync(path.join(folder, src))) {
      try { fs.rmSync(path.join(td.dir, n), { force: true }); } catch { /* 다음 기회에 */ }
    }
  }
}

// ───────────── 배경 썸네일 ─────────────

async function pregen(current) {
  const t0 = performance.now();
  const folders = gameFolders(current.root);
  const work = [];
  for (const folder of folders) {
    if (current.canceled) return;
    const r = await scan(folder, current);
    work.push(...r.work);
  }
  index.flushAll();
  timing.mark("pregen.scan", { folders: folders.length, missing: work.length, ms: Math.round(performance.now() - t0) });
  current.pregenTotal = work.length;
  if (work.length === 0 || current.canceled) return;
  const show = work.length >= PROGRESS_MIN;
  let done = 0, last = 0;
  const report = (phase) => {
    if (!show) return;
    current.onProgress?.({ phase, done, total: work.length });
  };
  report("run");
  const g0 = performance.now();
  let next = 0, pauses = 0, pausedMs = 0;
  const lane = async () => {
    while (!current.canceled && !current.pregenStopped && next < work.length) {
      // 사용자가 다른 창(게임)으로 가면 다음 장을 안 꺼낸다 — 돌아오면 이어서
      if (!gate.isActive()) {
        const p0 = performance.now();
        pauses++;
        timing.mark("pregen.pause", { done, total: work.length });
        if (!(await gate.waitActive(() => current.canceled || current.pregenStopped))) return;
        pausedMs += performance.now() - p0;
        timing.mark("pregen.resume", { done, total: work.length, pausedMs: Math.round(performance.now() - p0) });
        continue;
      }
      const w = work[next++];
      await thumbs.generate(w.source, { priority: "low", lqipOnly: w.lqipOnly });
      done++;
      const now = performance.now();
      if (now - last > 250) { last = now; if (!current.canceled) report("run"); }
      await sleep(PREGEN_YIELD_MS);
    }
  };
  await Promise.all(Array.from({ length: PREGEN_LANES }, lane));
  index.flushAll();
  if (current.canceled) return;
  if (current.pregenStopped) { report("canceled"); return; }
  const ms = performance.now() - g0 - pausedMs;
  timing.mark("pregen.done", { n: work.length, ms: Math.round(ms), perSec: +(work.length / (ms / 1000)).toFixed(1), pauses, pausedMs: Math.round(pausedMs) });
  report("done");
}

// ───────────── 감시 ─────────────

function watch(current) {
  if (current.canceled) return;
  let watcher;
  try {
    watcher = fs.watch(current.root, { recursive: true, persistent: false });
  } catch {
    // 루트가 아직 없다 — 조금 뒤 다시
    current.watchRetry = setTimeout(() => watch(current), 5000);
    return;
  }
  current.watcher = watcher;
  watcher.on("change", (_type, filename) => {
    if (current.canceled) return;
    const rel = typeof filename === "string" ? filename : filename?.toString("utf8");
    if (!rel) { for (const f of gameFolders(current.root)) queueScan(current, f); return; }
    const parts = rel.split(/[\\/]/).filter(Boolean);
    if (parts.length === 0 || parts[0].startsWith(".")) return;
    if (parts.length >= 2 && media.isThumbDirName(parts[1])) return;   // 우리가 쓰는 곳
    if (parts.length >= 2 && parts[1].toLowerCase() === ".incoming") return;   // 넣는 중인 묶음 — 커밋되면 게임 폴더에서 다시 온다
    queueScan(current, path.join(current.root, parts[0]));
  });
  watcher.on("error", () => {
    // 윈도우: 감시하던 폴더가 지워지면 EPERM. 닫고 다시 붙는다
    try { watcher.close(); } catch { /* 이미 닫힘 */ }
    if (current.watcher === watcher) current.watcher = null;
    if (!current.canceled) current.watchRetry = setTimeout(() => watch(current), 2000);
  });
}

function queueScan(current, folder) {
  clearTimeout(current.scanTimers.get(folder));
  current.scanTimers.set(folder, setTimeout(async () => {
    current.scanTimers.delete(folder);
    if (current.canceled) return;
    // 감시는 적어 두기만 한다 — 훑고 만드는 건 사용자가 STARLOG로 돌아왔을 때 (탐색기로 넣는 동안은 대개 다른 창이다)
    if (!gate.isActive()) {
      timing.mark("watch.deferred", { folder: path.basename(folder) });
      if (!(await gate.waitActive(() => current.canceled))) return;
    }
    const r = await scan(folder, current);
    index.flushAll();
    if (current.canceled) return;
    if (r.changed) current.onChanged?.({ folder: path.basename(folder) });
    // 방금 넣은 파일 — 화면이 곧 부를 것이라 높은 순위로
    await Promise.all(r.work.map((w) => thumbs.generate(w.source, { priority: "high", lqipOnly: w.lqipOnly })));
    index.flushAll();
    if (r.work.length && !current.canceled) {
      timing.mark("watch", { folder: path.basename(folder), made: r.work.length });
      current.onChanged?.({ folder: path.basename(folder), thumbs: true });
    }
  }, WATCH_DEBOUNCE_MS));
}

// ───────────── 파일 캐시 데우기 ─────────────

async function warm(current) {
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  let budget = WARM_BUDGET;
  const seen = new Set();
  const t0 = performance.now();
  let files = 0, bytes = 0;
  const readOne = async (file) => {
    if (seen.has(file)) return true;
    seen.add(file);
    let fh;
    try {
      fh = await fsp.open(file, "r");
      for (;;) {
        // 화면이 파일을 부르는 중이면 비켜 준다. STARLOG를 안 보고 있으면(게임 중) 멈춘다
        while (!current.canceled && performance.now() - current.lastRequest < QUIET_MS) await sleep(QUIET_MS);
        if (!gate.isActive()) {
          timing.mark("warm.pause", { files });
          if (!(await gate.waitActive(() => current.canceled))) return false;
        }
        if (current.canceled) return false;
        const { bytesRead } = await fh.read(chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        budget -= bytesRead;
        bytes += bytesRead;
      }
      files++;
    } catch { /* 그새 지워짐 */ } finally { await fh?.close().catch(() => {}); }
    return budget > 0;
  };
  const filesOf = (folder) => {
    try { return fs.readdirSync(folder).filter(isMediaName).sort().map((n) => path.join(folder, n)); } catch { return []; }
  };
  const done = new Set();
  while (!current.canceled && budget > 0) {
    // 화면이 보는 폴더 먼저, 그다음 최근에 바뀐 폴더 순
    const names = gameFolders(current.root).map((f) => path.basename(f)).filter((n) => !done.has(n));
    if (names.length === 0) break;
    const name = current.activeFolder && names.includes(current.activeFolder) ? current.activeFolder : names[0];
    done.add(name);
    const focused = name === current.activeFolder;
    for (const f of filesOf(path.join(current.root, name))) {
      if (!(await readOne(f))) break;
      if (!focused) {
        await sleep(8);   // 보는 폴더가 아니면 아주 천천히
        // 화면이 다른 폴더를 보기 시작했다 — 그쪽으로 옮겨 탄다 (읽은 것은 `seen`이 기억한다)
        if (current.activeFolder && current.activeFolder !== name && !done.has(current.activeFolder)) { done.delete(name); break; }
      }
    }
  }
  timing.mark("warm.done", { files, MB: Math.round(bytes / 1048576), ms: Math.round(performance.now() - t0) });
}

// ───────────── 수명 ─────────────

/**
 * @param root  `<데이터 루트>/media`
 * @param opts  `{ onProgress, onChanged, pregen, watch, warm }` — 셋 다 기본 켬
 */
function start(root, opts = {}) {
  stop();
  if (!root) return;
  const current = {
    root, gen: ++gen, canceled: false, scanTimers: new Map(), watcher: null, watchRetry: null,
    lastRequest: 0, activeFolder: null, pregenTotal: 0,
    onProgress: opts.onProgress, onChanged: opts.onChanged,
  };
  run = current;
  // 빠른 공장을 미리 띄워 둔다 — 첫 화면의 썸네일이 창 기동(수백 ms)을 기다리지 않게. 띄우기만 하고 일은 없다
  if (gate.isActive()) pool.fast.warm();
  if (opts.watch !== false) watch(current);
  current.startTimer = setTimeout(async () => {
    if (current.canceled) return;
    try {
      if (opts.pregen !== false) await pregen(current);
      if (opts.warm !== false && !current.canceled) await warm(current);
    } catch (e) {
      console.warn("[media] 배경 일 실패", e?.message ?? e);
    }
  }, START_DELAY_MS);
}

/** 서버를 내릴 때·앱을 끌 때. 줄 서 있던 배경 썸네일은 버린다 (도는 것은 끝까지 — 반쯤 쓴 파일을 안 남기려고) */
function stop() {
  const current = run;
  run = null;
  if (!current) return;
  current.canceled = true;
  clearTimeout(current.startTimer);
  clearTimeout(current.watchRetry);
  for (const t of current.scanTimers.values()) clearTimeout(t);
  try { current.watcher?.close(); } catch { /* 이미 닫힘 */ }
  thumbs.cancelLow();
  if (current.pregenTotal >= PROGRESS_MIN) current.onProgress?.({ phase: "canceled", done: 0, total: current.pregenTotal });
  index.forget();
}

/** 넣기가 끝난 폴더를 지금 훑는다 (감시가 놓쳐도) */
function rescan(folder) {
  if (run) queueScan(run, folder);
}

/** `starlog-media://` 요청마다 — 지금 화면이 보는 폴더, 그리고 "바쁘다"는 표시 */
function noteRequest(folder) {
  if (!run) return;
  run.lastRequest = performance.now();
  run.activeFolder = folder;
}

/** 진행 알림의 [중단] — 배경 썸네일만 멈춘다 (감시·화면이 부르는 것은 그대로) */
function cancelPregen() {
  if (!run) return 0;
  run.pregenStopped = true;
  return thumbs.cancelLow();
}

module.exports = { start, stop, noteRequest, cancelPregen, scan, rescan };
