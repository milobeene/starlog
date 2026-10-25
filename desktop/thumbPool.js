/**
 * 썸네일 공장 — **숨긴 렌더러 하나 + 워커 N개**에서 `createImageBitmap(resize)` → `OffscreenCanvas.convertToBlob(jpeg)`.
 *
 * ## 왜 메인이 아닌가
 *
 * `nativeImage.createFromPath`+`resize`는 메인 스레드에서 동기로 돈다 — 2장씩 돌려도 초당 61장, 메인이 한 번에 110ms까지 멈췄다
 * (창 입력·IPC·`app://`·`starlog-media://` 응답이 전부 그 뒤에 선다). 같은 일을 워커 6개에 나누면 초당 179장, 메인 지연은 10ms 안쪽이다
 * (2026-10-25, 맥 실측 `scratchpad/shots-perf/bench.js`). sharp는 새 의존성이라 안 쓴다.
 *
 * 렌더러는 sandbox다 — 남이 폴더에 넣은 깨진 그림을 푸는 일이 **권한 없는 프로세스**에서 일어난다 (메인에서 풀던 것보다 낫다).
 * 바이트는 메인이 읽어 MessagePort로 넘긴다. 렌더러는 파일 시스템을 모른다.
 *
 * ## VRAM을 안 쓴다
 *
 * 캔버스를 `willReadFrequently`로 만든다 — 크로미움이 GPU 캔버스 대신 CPU 비트맵을 쓴다. 사용자 PC가 VRAM이 적다
 */
const os = require("os");
const path = require("path");
const { BrowserWindow, MessageChannelMain } = require("electron");

/**
 * 워커 수 — 화면이 부르는 것 기준 `min(4, 코어/2)`. 사용자는 STARLOG를 켜 둔 채 CPU를 많이 먹는 에뮬레이터를 돌린다 —
 * 6개(코어-1)까지 쓰면 그 순간 게임이 끊긴다. 배경 일은 이 중 2개까지만 쓴다 (`thumbs.js` LOW_SLOTS)
 */
const SIZE = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)));
/** 한 장에 주는 시간. 넘기면 그 장은 메인의 nativeImage 길로 (`thumbs.js`) */
const JOB_TIMEOUT_MS = 20_000;
/** 이만큼 일이 없으면 창을 내린다 — 렌더러 하나가 수십 MB다 */
const IDLE_CLOSE_MS = 60_000;

/** 워커 본문. 문자열로 페이지에 실어 Blob URL로 띄운다 (`file://`·추가 파일 없이 — 패키지 화이트리스트가 `*.js`뿐이다) */
function workerMain() {
  const LQIP_EDGE = 8;
  function lqip(src) {
    const s = LQIP_EDGE / Math.max(src.width, src.height);
    const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext("2d", { willReadFrequently: true, alpha: false });
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(src, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let bin = "";
    for (let i = 0; i < d.length; i += 4) bin += String.fromCharCode(d[i], d[i + 1], d[i + 2]);
    return `${w}x${h}:${btoa(bin)}`;
  }
  const fit = (W, H, box) => {
    const s = Math.min(1, box / Math.max(W, H));
    return [Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s))];
  };
  self.onmessage = async (e) => {
    const j = e.data;
    try {
      const blob = new Blob([j.bytes], { type: j.type });
      let bmp;
      if (j.w > 0 && j.h > 0) {
        // 머리글에서 읽은 크기 — 한 번에 줄여 푼다 (원본 크기 비트맵을 안 만든다)
        const [w, h] = fit(j.w, j.h, j.box);
        bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
      } else {
        // 크기를 모르거나 EXIF 회전이 있는 것 — 풀고 나서 돌아간 크기로 줄인다
        const full = await createImageBitmap(blob);
        const [w, h] = fit(full.width, full.height, j.box);
        if (w === full.width && h === full.height) bmp = full;
        else { bmp = await createImageBitmap(full, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" }); full.close(); }
      }
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext("2d", { willReadFrequently: true, alpha: false });
      g.drawImage(bmp, 0, 0);
      bmp.close();
      const jpeg = j.mode === "thumb" ? await (await c.convertToBlob({ type: "image/jpeg", quality: j.q })).arrayBuffer() : null;
      self.postMessage({ id: j.id, jpeg, tw: c.width, th: c.height, lq: lqip(c) }, jpeg ? [jpeg] : []);
    } catch (err) {
      self.postMessage({ id: j.id, error: String((err && err.message) || err) });
    }
  };
}

/** 페이지 본문 — 포트를 받으면 워커를 띄우고, 일을 노는 워커에 나눈다 */
function pageHtml(size) {
  const page = `
const WORKER = URL.createObjectURL(new Blob(["(" + ${JSON.stringify(workerMain.toString())} + ")()"], { type: "text/javascript" }));
let port = null;
const idle = [], queue = [];
function pump() {
  while (idle.length && queue.length) {
    const w = idle.pop(), job = queue.shift();
    const b = job.bytes;
    const exact = b && b.byteOffset === 0 && b.byteLength === b.buffer.byteLength;
    w.postMessage(job, exact ? [b.buffer] : []);
  }
}
window.addEventListener("message", (e) => {
  if (e.data !== "thumb:port" || port || !e.ports[0]) return;
  port = e.ports[0];
  for (let i = 0; i < ${size}; i++) {
    const w = new Worker(WORKER);
    w.onmessage = (r) => { port.postMessage(r.data); idle.push(w); pump(); };
    w.onerror = (err) => { err.preventDefault(); };
    idle.push(w);
  }
  port.onmessage = (m) => { queue.push(m.data); pump(); };
  port.start();
  port.postMessage({ type: "ready", workers: ${size} });
});`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>thumbs</title><script>${page}</script>`)}`;
}

/**
 * 공장 하나 — 숨긴 창 하나 + 워커 `size`개.
 *
 * ⚠️ `foreground`가 공장의 **OS 우선순위**를 정한다 (2026-10-26 맥 실측, JPEG 237장·워커 4).
 * `paintWhenInitiallyHidden: false`인 숨긴 창은 크로미움이 "안 보이는 렌더러"로 보고 프로세스 우선순위를 내린다 —
 * 같은 일이 초당 88장, `true`면 264장. 그래서 둘로 나눈다:
 * - **빠른 공장**(foreground): 화면이 지금 부르는 썸네일. 사용자가 STARLOG를 보고 있을 때만 띄우고, 떠나면 곧 닫는다
 * - **느린 공장**(background): 배경 썸네일. OS가 낮은 순위로 돌려 게임·에뮬레이터에 CPU를 양보한다
 */
function createPool({ size, foreground, idleCloseMs }) {
  let win = null;
  let port = null;
  let ready = null;
  let seq = 0;
  const pending = new Map();
  let idleTimer = null;
  let broken = 0;
  let closeWhenIdle = false;

  function failAll(reason) {
    for (const [, p] of pending) { clearTimeout(p.timer); p.reject(new Error(reason)); }
    pending.clear();
  }

  function close() {
    clearTimeout(idleTimer);
    idleTimer = null;
    closeWhenIdle = false;
    failAll("공장을 닫았다");
    try { port?.close(); } catch { /* 이미 닫힘 */ }
    port = null;
    ready = null;
    if (win && !win.isDestroyed()) win.destroy();
    win = null;
  }

  function armIdle() {
    clearTimeout(idleTimer);
    if (closeWhenIdle && pending.size === 0) { close(); return; }
    idleTimer = setTimeout(() => { if (pending.size === 0) close(); }, idleCloseMs);
  }

  function ensure() {
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      win = new BrowserWindow({
        show: false,
        skipTaskbar: true,
        focusable: false,
        width: 64,
        height: 64,
        paintWhenInitiallyHidden: foreground,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          // 숨긴 창은 기본으로 타이머·작업이 늦춰진다 — 공장이 느려진다
          backgroundThrottling: false,
          spellcheck: false,
          preload: path.join(__dirname, "thumbPreload.js"),
        },
      });
      const contents = win.webContents;
      // 이 창은 어디로도 가지 않는다
      contents.on("will-navigate", (e) => e.preventDefault());
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      contents.on("render-process-gone", () => { broken++; close(); });
      const timer = setTimeout(() => { reject(new Error("공장이 안 떴다")); close(); }, 15_000);
      contents.once("did-finish-load", () => {
        const { port1, port2 } = new MessageChannelMain();
        port = port1;
        port1.on("message", (e) => {
          const m = e.data;
          if (m?.type === "ready") { clearTimeout(timer); resolve(m.workers); return; }
          const p = pending.get(m?.id);
          if (!p) return;
          pending.delete(m.id);
          clearTimeout(p.timer);
          if (m.error) p.reject(new Error(m.error));
          else p.resolve({ jpeg: m.jpeg ? Buffer.from(m.jpeg) : null, tw: m.tw, th: m.th, lq: m.lq });
          if (pending.size === 0) armIdle();
        });
        port1.start();
        contents.postMessage("thumb:port", null, [port2]);
      });
      win.loadURL(pageHtml(size)).catch((e) => { clearTimeout(timer); reject(e); close(); });
    });
    ready.catch(() => {});
    return ready;
  }

  /**
   * 한 장. `job` = `{ mode: "thumb"|"lqip", bytes: Uint8Array, type, w, h, box, q }` (`q`는 0~1).
   * 렌더러가 여러 번 죽었으면(드라이버·메모리) 더 띄우지 않는다 — 부르는 쪽이 nativeImage로 물러난다
   */
  async function run(job) {
    if (broken >= 3) throw new Error("공장이 여러 번 죽었다");
    closeWhenIdle = false;
    await ensure();
    clearTimeout(idleTimer);
    // 뷰가 버퍼 일부만 가리키면 구조화 복제가 **버퍼 전체**를 보낸다 — 딱 맞는 사본으로
    const b = job.bytes;
    const bytes = b.byteOffset === 0 && b.byteLength === b.buffer.byteLength ? b : new Uint8Array(b);
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("시간 초과")); }, JOB_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      try {
        port.postMessage({ ...job, id, bytes });
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(e);
      }
    });
  }

  return {
    size,
    run,
    close,
    /** 첫 요청이 창 기동(수백 ms)을 기다리지 않게 미리 띄운다 */
    warm() { if (broken < 3) ensure().then(armIdle, () => {}); },
    /** 하던 것만 끝내고 닫는다 — 사용자가 다른 창(게임)으로 갔을 때 */
    closeWhenIdle() { if (!win) return; closeWhenIdle = true; if (pending.size === 0) close(); },
    isOpen: () => win !== null,
  };
}

/** 화면이 부르는 썸네일 — 사용자가 STARLOG를 보고 있을 때만 쓰고, 떠나면 10초 안에 닫는다 */
const fast = createPool({ size: SIZE, foreground: true, idleCloseMs: 10_000 });
/** 배경 썸네일 — 워커 2개, 낮은 OS 우선순위 */
const slow = createPool({ size: Math.min(2, SIZE), foreground: false, idleCloseMs: IDLE_CLOSE_MS });

module.exports = { SIZE, fast, slow, close: () => { fast.close(); slow.close(); } };
