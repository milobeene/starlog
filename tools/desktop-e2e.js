/**
 * 데스크탑 앱 전체 흐름 시험 (v2) — **창을 띄우지 않고** 진짜 `desktop/main.js`를 돌린다.
 *
 *   ./tools/build-desktop.sh            # 먼저 — desktop/web, desktop/server가 있어야 한다
 *   desktop/node_modules/.bin/electron tools/desktop-e2e.js
 *
 * - 앱 데이터 경로를 임시 폴더로 바꾼다 → **실제 설정·연결·세이브파일을 건드리지 않는다**
 * - `BrowserWindow`를 `show: false`로 바꿔 끼운다 (`require("electron")`을 가로채서)
 * - 화면이 쓰는 `window.starlog` 브리지를 그대로 불러 입구 → 기동 → 본 앱 → 백업 → 되살리기 → 종료를 밟는다
 * - ⚠️ **본 앱도 `app://starlog`에서 연다** — 실제 앱이 그렇다(창은 평생 `app://` 한 장, API만
 *   `http://127.0.0.1:포트`로 → CORS). 처음엔 창을 http로 옮겨 열어서 **CORS가 빠진 걸 못 잡았다** (2026-10-24)
 *
 * 클라우드 모드는 시험하지 않는다 — 실제 Neon에 붙기 때문이다. 클라우드 백업은 `STARLOG_E2E_CLOUD_BACKUP_LOCAL`로
 * 로컬 세션에서 같은 길(내보내기 → `.json.gz` → 풀기)을 밟는다 (`cloudBackupSteps`).
 * 서버가 안 뜨거나(멈춤·진단 없이 죽음) 점검 전용 기동은 **가짜 서버**로 본다 — 서버 번들 앞에 끼운
 * 작은 스크립트가 제어 파일을 읽고 흉내 내거나 진짜 번들을 불러온다 (`robustnessSteps`).
 *
 * 임시 폴더는 끝나면 지운다 (`STARLOG_E2E_KEEP=1`이면 남긴다).
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const Module = require("module");
const url = require("url");

const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "starlog-e2e-"));
/*
 * 사용자 셸에 개발 프로필이 남아 있는 상황을 일부러 만든다 — 메인이 서버에 넘기지 않아야 한다.
 * 새면 서버가 CORS를 끄고 떠서 아래 "남의 출처 요청은 403"이 깨진다
 */
process.env.STARLOG_PROFILE = "dev";
process.env.STARLOG_THUMBNAILER = "copy";
// 기동 대기 한계를 줄인다 — 멈춘 서버의 TIMEOUT을 90초 기다리지 않게 (메인은 줄이는 것만 받는다)
process.env.STARLOG_LAUNCH_TIMEOUT_MS = "8000";

// 실패가 사람 화면에 대화상자로 뜨지 않게 — 적고 실패로 센다
require("electron").dialog.showErrorBox = (title, content) => console.error(`[error box] ${title}: ${content}`);
process.on("uncaughtException", (e) => { console.error("[uncaught]", e?.stack ?? e); require("electron").app.exit(1); });
// 전체 와치독 — 어디서 멈추면 영영 안 끝나서 CI·스크립트가 못 잡았다
setTimeout(() => { console.error("✗ 10분 안에 끝나지 않았다"); require("electron").app.exit(1); }, 10 * 60_000).unref();

// ── 창 숨기기 + 경로 바꾸기 (main.js가 불리기 전에) ──
const realElectron = require("electron");
realElectron.app.setPath("appData", path.join(TMP, "appData"));
realElectron.app.setPath("userData", path.join(TMP, "userData"));
/*
 * ⚠️ 사용자의 진짜 키체인을 안 건드린다 — 크로미움의 가짜 키체인으로 safeStorage를 돌린다.
 * 리눅스는 같은 이유로 basic(메모리 키)
 */
realElectron.app.commandLine.appendSwitch("use-mock-keychain");
if (process.platform === "linux") realElectron.app.commandLine.appendSwitch("password-store", "basic");
/** 메인이 OS에 넘기려던 것(기본 브라우저·탐색기) — 실제로 열지 않고 적어만 둔다 */
const shellCalls = [];
const fakeShell = new Proxy(realElectron.shell, {
  get: (t, k) => {
    if (k === "openExternal") return async (u) => { shellCalls.push(["openExternal", u]); };
    if (k === "openPath") return async (p) => { shellCalls.push(["openPath", p]); return ""; };
    return t[k];
  },
});
const RealWindow = realElectron.BrowserWindow;
let win = null;
class HiddenWindow extends RealWindow {
  constructor(options = {}) {
    // 숨긴 창은 타이머가 늦춰진다 — 키 반복(33ms) 시험이 늦춰진 타이머를 재게 된다
    super({ ...options, show: false, webPreferences: { ...(options.webPreferences ?? {}), backgroundThrottling: false } });
    // 썸네일 공장(숨긴 창, `thumbPool.js`)은 본 창이 아니다
    if (!String(options?.webPreferences?.preload ?? "").includes("thumbPreload")) win = this;
  }
  show() {}
  showInactive() {}
  focus() {}
  maximize() {}
}
/*
 * 서버 번들 앞에 끼우는 스크립트. 제어 파일(`FAKE_CTL`)이 시키는 대로 흉내 내고, 시키는 게 없으면 진짜 번들을 부른다.
 * 기동마다 받은 환경(점검 전용인가·어느 DB인가)을 `FAKE_LOG`에 한 줄씩 남긴다 — 값이 아니라 모양만
 */
const FAKE_CTL = path.join(TMP, "fake-ctl.json");
const FAKE_LOG = path.join(TMP, "fake-spawns.jsonl");
const FAKE_SERVER = path.join(TMP, "server-shim.mjs");
fs.writeFileSync(FAKE_SERVER, `import fs from "fs";
import { pathToFileURL } from "url";
let ctl = {};
try { ctl = JSON.parse(fs.readFileSync(${JSON.stringify(FAKE_CTL)}, "utf8")); } catch {}
fs.appendFileSync(${JSON.stringify(FAKE_LOG)}, JSON.stringify({ pid: process.pid, mode: ctl.mode ?? null,
  checkOnly: process.env.STARLOG_CHECK_ONLY ?? null, dbDir: process.env.STARLOG_DB_DIR ?? null, dbUrl: Boolean(process.env.STARLOG_DB_URL),
  coverTarget: process.env.STARLOG_COVER_TARGET ?? null,
  legacyMedia: Object.keys(process.env).filter((k) => k.startsWith("STARLOG_MEDIA_USE_STORAGE")) }) + "\\n");
const pp = process.parentPort;
if (ctl.fakeCheck && process.env.STARLOG_CHECK_ONLY === "true") {
  console.log("STARLOG_CHECKED");
  pp?.postMessage({ type: "checked" });
  setTimeout(() => process.exit(0), 50);
} else if (ctl.mode === "hang") {
  pp?.on("message", (e) => { if (e.data?.type === "shutdown") process.exit(0); });
  setInterval(() => {}, 1000);
} else if (ctl.mode === "crash") {
  setTimeout(() => process.exit(1), 200);
} else {
  await import(${JSON.stringify(url.pathToFileURL(path.join(ROOT, "desktop/server/main.mjs")).href)});
}
`);
const fakeMode = (ctl) => fs.writeFileSync(FAKE_CTL, JSON.stringify(ctl ?? {}));
const spawnLog = () => (fs.existsSync(FAKE_LOG) ? fs.readFileSync(FAKE_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
fakeMode({});

/** `starlog-media://`로 온 요청 주소 — 뷰어가 이웃 원본을 미리 받는지 본다 (메인의 핸들러를 감싸 적기만 한다) */
const mediaRequests = [];
const fakeProtocol = new Proxy(realElectron.protocol, {
  get: (t, k) => (k === "handle"
    ? (scheme, fn) => t.handle(scheme, scheme === "starlog-media" ? (req) => { mediaRequests.push(req.url); return fn(req); } : fn)
    : typeof t[k] === "function" ? t[k].bind(t) : t[k]),
});
const load = Module._load;
Module._load = function (request, ...rest) {
  const m = load.call(this, request, ...rest);
  if (request === "electron") {
    return new Proxy(m, { get: (t, k) => (k === "BrowserWindow" ? HiddenWindow : k === "shell" ? fakeShell : k === "protocol" ? fakeProtocol : t[k]) });
  }
  if (request === "./paths" && typeof m?.serverEntry === "function") {
    return { ...m, serverEntry: () => FAKE_SERVER };
  }
  return m;
};
realElectron.app.dock?.hide();

require(path.join(ROOT, "desktop/main.js"));

// ── 시험 ──
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitWindowLoaded() {
  for (let i = 0; i < 100 && !win; i += 1) await sleep(100);
  if (!win) throw new Error("창이 안 만들어졌다");
  if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once("did-finish-load", r));
}
const js = (code) => win.webContents.executeJavaScript(code, true);
async function goto(url) {
  await win.loadURL(url);
  await sleep(1500);   // 화면이 첫 데이터를 받아 그릴 시간
}
/** 지금 서버의 토큰 — 기동마다 바뀌므로 매번 다리에 묻는다 (서버가 토큰 검사를 아직 안 해도 무해하다) */
async function auth() {
  const token = await js("window.starlog.session.token()");
  return token ? { "X-Starlog-Token": token } : {};
}
async function api(port, method, p, body) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method, headers: { ...(await auth()), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

// ── 스크린샷 관리자: 썸네일(서버 → 메인) · 클립보드 · 내보내기 (P6 S2) ──

const media = require(path.join(ROOT, "desktop/media.js"));
const thumbs = require(path.join(ROOT, "desktop/thumbs.js"));
const MEDIA_ROOT = path.join(TMP, "appData/starlog/data/media");

/** 시험 파일 — 가로 PNG·세로 JPEG·정사각 PNG는 nativeImage로, WebP·MP4는 숨긴 창의 캔버스로 만든다 */
async function makeSamples(dir) {
  const { nativeImage } = realElectron;
  const bitmap = (w, h) => {
    const buf = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; buf[i] = x % 256; buf[i + 1] = y % 256; buf[i + 2] = 128; buf[i + 3] = 255; }
    return nativeImage.createFromBitmap(buf, { width: w, height: h });
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "land.png"), bitmap(2560, 1440).toPNG());
  fs.writeFileSync(path.join(dir, "port.jpg"), bitmap(1080, 1920).toJPEG(90));
  fs.writeFileSync(path.join(dir, "square.png"), bitmap(1000, 1000).toPNG());
  // PNG 머리만 맞고 속은 깨진 것 — 서버 검사(매직 넘버)는 통과하고 썸네일은 못 만든다
  fs.writeFileSync(path.join(dir, "broken.png"), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("garbage")]));
  const w = new RealWindow({ show: false });
  await w.loadURL("data:text/html,<canvas id=c width=640 height=360></canvas>");
  const encoded = await w.webContents.executeJavaScript(`(async () => {
    const c = document.getElementById('c'), g = c.getContext('2d');
    const draw = (f) => { g.fillStyle = 'hsl(' + (f * 7 % 360) + ',80%,50%)'; g.fillRect(0, 0, 640, 360); g.fillStyle = '#fff'; g.fillRect(40 + f * 4, 120, 120, 120); };
    draw(0);
    const webp = c.toDataURL('image/webp', 0.8).split(',')[1];
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/mp4;codecs=avc1' });
    const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    let f = 0; const t = setInterval(() => draw(++f), 33);
    rec.start(); await new Promise((r) => setTimeout(r, 1200)); rec.stop(); await new Promise((r) => (rec.onstop = r)); clearInterval(t);
    const u = new Uint8Array(await new Blob(chunks).arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return { webp, mp4: btoa(s) };
  })()`);
  w.destroy();
  fs.writeFileSync(path.join(dir, "pic.webp"), Buffer.from(encoded.webp, "base64"));
  fs.writeFileSync(path.join(dir, "clip.mp4"), Buffer.from(encoded.mp4, "base64"));
}

async function upload(port, entryId, file, takenAt) {
  const fd = new FormData();
  fd.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));
  const res = await fetch(`http://127.0.0.1:${port}/api/backlog/${entryId}/screenshots?takenAt=${takenAt}`, { method: "POST", body: fd, headers: await auth() });
  return { status: res.status, json: await res.json() };
}

async function mediaSteps(port, entryId) {
  const { nativeImage, clipboard } = realElectron;
  const samples = path.join(TMP, "samples");
  await makeSamples(samples);

  // 올린 순서와 찍은 시각을 일부러 엇갈리게 — 목록은 찍은 시각 최신순이어야 한다
  const plan = [["land.png", 1700000003000], ["port.jpg", 1700000001000], ["square.png", 1700000005000],
    ["pic.webp", 1700000002000], ["clip.mp4", 1700000004000], ["broken.png", 1700000000000]];
  const stored = {};
  for (const [name, takenAt] of plan) {
    const r = await upload(port, entryId, path.join(samples, name), takenAt);
    stored[name] = r.json?.fileName;
    if (r.status !== 200) check(`올리기 ${name}`, false, JSON.stringify(r.json));
  }
  check("스크린샷 6개 올림 (썸네일 주소가 붙는다)", Object.values(stored).every(Boolean), JSON.stringify(stored));

  const listed = await api(port, "GET", "/api/screenshots");
  const items = listed.json?.items ?? [];
  const order = items.map((i) => i.fileName).join(",");
  const expectedOrder = [...plan].sort((a, b) => b[1] - a[1]).map(([n]) => stored[n]).join(",");
  check("갤러리 — 찍은 시각 최신순", order === expectedOrder, order);
  check("갤러리 — games 요약", listed.json?.games?.[0]?.imageCount === 5 && listed.json?.games?.[0]?.videoCount === 1,
    JSON.stringify(listed.json?.games));

  // 올리자마자 메인이 만들기 시작한다 (기다리지 않는 생성). 잠깐 기다렸다 폴더를 본다
  await sleep(1500);
  const folder = path.dirname(fs.realpathSync(path.join(MEDIA_ROOT, fs.readdirSync(MEDIA_ROOT)[0], stored["land.png"])));
  const thumbsDir = path.join(folder, ".thumbs");
  const made = fs.existsSync(thumbsDir) ? fs.readdirSync(thumbsDir).filter((f) => f.endsWith(".jpg")).sort() : [];
  check("올릴 때 썸네일을 미리 만든다 (깨진 것 빼고 5장)", made.length === 5 && !made.includes(`${stored["broken.png"]}.jpg`), made.join(","));
  const srcMtime = fs.statSync(path.join(folder, stored["land.png"])).mtimeMs;
  const thumbMtime = fs.statSync(path.join(thumbsDir, `${stored["land.png"]}.jpg`)).mtimeMs;
  check("썸네일 수정시각 = 원본 수정시각 (신선도 표시)", Math.abs(srcMtime - thumbMtime) <= 1, `${srcMtime} / ${thumbMtime}`);

  check("목록 주소는 starlog-media:// (원본·썸네일)", items.every((i) => i.url.startsWith("starlog-media://shot/") && (i.thumbUrl === null || i.thumbUrl.startsWith("starlog-media://thumb/"))),
    items.map((i) => i.thumbUrl).join(" "));
  const index = JSON.parse(fs.readFileSync(path.join(thumbsDir, "index.json"), "utf8"));
  check("폴더 색인 — 만든 것은 자리표시·원본 크기·t=1, 깨진 것은 t=0",
    /^8x5:/.test(index.files[stored["land.png"]]?.p ?? "") && index.files[stored["land.png"]]?.w === 2560 && index.files[stored["land.png"]]?.t === 1
      && index.files[stored["port.jpg"]]?.w === 1080 && index.files[stored["port.jpg"]]?.h === 1920 && index.files[stored["broken.png"]]?.t === 0,
    JSON.stringify(index.files[stored["land.png"]]));

  // 썸네일을 지우고 다시 부르면 이 요청에서 만든다 (지연 생성, http 길 — 서버가 메인에 부탁한다) — 시간을 잰다
  fs.rmSync(thumbsDir, { recursive: true, force: true });
  const sizes = {};
  for (const [name] of plan) {
    const item = items.find((i) => i.fileName === stored[name]);
    if (!item?.thumbUrl && name !== "broken.png") { sizes[name] = "thumbUrl 없음"; continue; }
    const t = Date.now();
    const res = await fetch(`http://127.0.0.1:${port}/api/backlog/${entryId}/screenshots/${encodeURIComponent(stored[name])}/thumb`, { headers: await auth() });
    const ms = Date.now() - t;
    if (res.status !== 200) { sizes[name] = `${res.status} ${ms}ms`; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const { width, height } = nativeImage.createFromBuffer(buf).getSize();
    sizes[name] = `${width}x${height} ${(buf.length / 1024).toFixed(0)}KB ${ms}ms ${res.headers.get("content-type")}`;
  }
  console.log(`    썸네일: ${JSON.stringify(sizes)}`);
  check("가로 사진 → 480×270", sizes["land.png"]?.startsWith("480x270"));
  check("세로 사진 → 270×480 (자르지 않고 박스에 맞춘다)", sizes["port.jpg"]?.startsWith("270x480"));
  check("정사각 → 480×480", sizes["square.png"]?.startsWith("480x480"));
  check("WebP → 공장(워커 createImageBitmap)이 푼다", /^480x270/.test(sizes["pic.webp"] ?? ""));
  check("MP4 → 실제 장면 480×270", /^480x270/.test(sizes["clip.mp4"] ?? ""));
  check("깨진 이미지 → 썸네일 404 (아이콘을 썸네일로 쓰지 않는다)", /^404/.test(sizes["broken.png"] ?? ""));
  await sleep(1200);   // 색인은 0.8초 모아 쓴다
  const again = await api(port, "GET", "/api/screenshots");
  check("깨진 이미지는 다음 목록부터 thumbUrl null",
    again.json?.items?.find((i) => i.fileName === stored["broken.png"])?.thumbUrl === null);
  const perEntry = await api(port, "GET", `/api/backlog/${entryId}/screenshots`);
  check("게임별 목록에도 thumbUrl", perEntry.json?.filter((i) => i.thumbUrl).length === 5);

  // ── 메인의 경로 검사 (서버가 준 경로도 그대로 안 믿는다) ──
  const outside = path.join(TMP, "outside.png");
  fs.writeFileSync(outside, fs.readFileSync(path.join(samples, "square.png")));
  fs.symlinkSync(outside, path.join(folder, "link.png"));
  check("메인 경로 검사 — 데이터 루트 밖 거절", media.mediaFileInside(MEDIA_ROOT, outside) === null);
  check("메인 경로 검사 — 밖을 가리키는 심볼릭 링크 거절", media.mediaFileInside(MEDIA_ROOT, path.join(folder, "link.png")) === null);
  check("메인 경로 검사 — 썸네일 폴더 거절", media.mediaFileInside(MEDIA_ROOT, path.join(thumbsDir, `${stored["land.png"]}.jpg`)) === null);
  check("메인 경로 검사 — 정상 파일 통과", media.mediaFileInside(MEDIA_ROOT, path.join(folder, stored["land.png"])) !== null);
  const ok = await thumbs.makeThumbnail({ source: outside }, MEDIA_ROOT);
  check("메인 — 밖의 파일로는 썸네일을 안 만든다", ok === false && !fs.existsSync(path.join(TMP, ".thumbs")));
  fs.rmSync(path.join(folder, "link.png"));
  // `.thumbs`를 밖을 가리키는 링크로 바꿔치기 — 링크를 따라가 밖에 쓰면 안 된다
  const realThumbs = `${thumbsDir}.real`;
  const trap = path.join(TMP, "trap");
  fs.mkdirSync(trap);
  fs.renameSync(thumbsDir, realThumbs);
  fs.symlinkSync(trap, thumbsDir);
  fs.rmSync(path.join(realThumbs, `${stored["square.png"]}.jpg`), { force: true });
  const viaLink = await thumbs.makeThumbnail({ source: path.join(folder, stored["square.png"]) }, MEDIA_ROOT);
  check("메인 — .thumbs가 심볼릭 링크면 썸네일을 안 쓴다", viaLink === false && fs.readdirSync(trap).length === 0, String(viaLink));
  fs.rmSync(thumbsDir);
  fs.renameSync(realThumbs, thumbsDir);

  await mediaProtocolSteps(port, entryId, folder, stored, items);

  // ── 클립보드 (사용자 클립보드를 잠깐 빌린다 — 끝나면 되돌린다) ──
  // 일렉트론 44부터 읽기는 전부 `clipboard.read()` 하나다 (readImage·readBuffer·availableFormats가 없어졌다)
  const { ClipboardItem } = realElectron;
  const clipTypes = async () => [...new Set((await clipboard.read()).flatMap((i) => i.types))];
  const clipBytes = async (type) => {
    const item = (await clipboard.read()).find((i) => i.types.includes(type));
    return item ? Buffer.from(await (await item.getType(type)).arrayBuffer()) : null;
  };
  const clipFiles = async () => ((await clipBytes("text/uri-list"))?.toString("utf8") ?? "")
    .split(/\r?\n/).filter(Boolean).map((u) => url.fileURLToPath(u));
  const readUrls = () => process.platform !== "darwin" ? [] : JSON.parse(execFileSync("osascript", ["-l", "JavaScript", "-e",
    `ObjC.import('AppKit'); const u=$.NSPasteboard.generalPasteboard.readObjectsForClassesOptions($([$.NSURL]),$({NSPasteboardURLReadingFileURLsOnlyKey:true}));
     const o=[]; for(let i=0;u&&i<u.count;i++) o.push(ObjC.unwrap(u.objectAtIndex(i).path)); JSON.stringify(o)`]).toString());
  const savedText = await clipboard.readText();
  const savedPng = await clipBytes("image/png");
  try {
    const ref = (n) => JSON.stringify({ entryId, fileName: stored[n] });
    const c1 = await js(`window.starlog.media.copy(${ref("land.png")})`);
    const pastedPng = await clipBytes("image/png");
    const pasted = pastedPng ? nativeImage.createFromBuffer(pastedPng).getSize() : null;
    check("복사 — 사진은 그림으로", c1.ok && c1.as === "image" && pasted.width === 2560 && pasted.height === 1440, `${JSON.stringify(c1)} ${JSON.stringify(pasted)}`);
    const c2 = await js(`window.starlog.media.copy(${ref("clip.mp4")})`);
    const one = await clipFiles();
    check("복사 — 영상은 파일 참조로 (text/uri-list)", c2.ok && c2.as === "file" && one.length === 1 && path.basename(one[0]) === stored["clip.mp4"],
      `${JSON.stringify(c2)} ${JSON.stringify(one)}`);
    if (process.platform === "darwin") {
      const finder = readUrls();
      check("복사 — 하나짜리 파일 참조도 파인더가 읽는다 (맥 NSURL)", finder.length === 1 && path.basename(finder[0]) === stored["clip.mp4"], JSON.stringify(finder));
    }
    const c3 = await js(`window.starlog.media.copy(${ref("pic.webp")})`);
    check("복사 — WebP도 파일 참조로", c3.ok && c3.as === "file");
    const c4 = await js(`window.starlog.media.copy({ entryId: ${entryId}, fileName: "../../../outside.png" })`);
    check("복사 — 폴더 탈출 이름은 NOT_FOUND", c4.ok === false && c4.reason === "NOT_FOUND", JSON.stringify(c4));
    const c5 = await js(`window.starlog.media.copy({ entryId: "1; rm", fileName: "x" }).then(() => "통과", (e) => "거절")`);
    check("복사 — 형식이 틀린 참조는 거절", c5 === "거절");

    // 여러 개 = 전부 파일 참조. 파인더가 실제로 읽는 모양(NSURL 목록)으로 확인한다
    if (process.platform === "darwin") {
      const m1 = await js(`window.starlog.media.copy([${ref("land.png")}, ${ref("clip.mp4")}, ${ref("pic.webp")}])`);
      // 맥이 한글 경로를 분해형(NFD)으로 돌려준다 — 합쳐서 견준다
      const urls = readUrls().map((f) => fs.realpathSync(f).normalize("NFC"));
      const want = ["land.png", "clip.mp4", "pic.webp"].map((n) => fs.realpathSync(path.join(folder, stored[n])).normalize("NFC"));
      check("복사 — 여러 개는 전부 파일로 (맥 NSFilenamesPboardType, 파인더가 읽는 URL 3개)",
        m1.ok && m1.as === "file" && m1.count === 3 && JSON.stringify(urls) === JSON.stringify(want), `${JSON.stringify(m1)} ${JSON.stringify(urls)}`);
      const types = await clipTypes();
      check("복사 — 여러 개일 때 그림은 안 실린다", !types.includes("image/png"), types.join(","));
      const m2 = await js(`window.starlog.media.copy([${ref("land.png")}, ${ref("land.png")}])`);
      check("복사 — 같은 파일을 두 번 고르면 한 번만", m2.ok && m2.count === 1 && m2.as === "image", JSON.stringify(m2));
      await js(`window.starlog.media.copy([${ref("land.png")}, ${ref("clip.mp4")}])`);
      const m3 = await js(`window.starlog.media.copy([${ref("pic.webp")}, { entryId: ${entryId}, fileName: "nope.png" }, { entryId: ${entryId}, fileName: "../../../outside.png" }])`);
      check("복사 — 하나라도 못 찾으면 아무것도 복사하지 않고 failed로 알린다",
        m3.ok === false && m3.reason === "NOT_FOUND" && m3.failed?.length === 2
          && JSON.stringify(readUrls().map((f) => path.basename(f))) === JSON.stringify([stored["land.png"], stored["clip.mp4"]]), JSON.stringify(m3));
    }
    const m4 = await js(`window.starlog.media.copy([]).then(() => "통과", () => "거절")`);
    const m5 = await js(`window.starlog.media.copy("x").then(() => "통과", () => "거절")`);
    const m6 = await js(`window.starlog.media.copy([null, 5]).then(() => "통과", () => "거절")`);
    const m7 = await js(`window.starlog.media.copy(Array.from({ length: 501 }, () => ({ entryId: ${entryId}, fileName: "a.png" }))).then(() => "통과", () => "거절")`);
    check("복사 — 빈 배열·문자열·쓰레기 원소·501개는 거절", [m4, m5, m6, m7].every((x) => x === "거절"), [m4, m5, m6, m7].join(","));
  } finally {
    if (savedPng) await clipboard.write([new ClipboardItem({ "image/png": new Blob([savedPng], { type: "image/png" }) })]);
    else await clipboard.writeText(savedText);
  }

  // ── 다른 창(우리 앱 문서가 아님)에서는 못 부른다 ──
  const stranger = new RealWindow({ show: false, webPreferences: { contextIsolation: true, preload: path.join(ROOT, "desktop/preload.js") } });
  await stranger.loadURL("data:text/html,stranger");
  check("우리 문서가 아니면 다리가 아예 없다 (preload)", (await stranger.webContents.executeJavaScript("typeof window.starlog")) === "undefined");
  stranger.destroy();
  /*
   * preload가 다리를 안 놓아도 메인이 다시 본다 — `ipcRenderer`를 그대로 내준 시험용 preload로
   * 남의 문서에서 직접 불러 본다
   */
  const rawPreload = path.join(TMP, "raw-preload.js");
  fs.writeFileSync(rawPreload, `const { contextBridge, ipcRenderer } = require("electron");
    contextBridge.exposeInMainWorld("raw", { invoke: (...a) => ipcRenderer.invoke(...a), sendSync: (...a) => ipcRenderer.sendSync(...a) });`);
  const raw = new RealWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: rawPreload } });
  await raw.loadURL("data:text/html,raw");
  const rawResults = await raw.webContents.executeJavaScript(`(async () => {
    const r = {};
    for (const [ch, ...args] of [["media:copy", { entryId: ${entryId}, fileName: ${JSON.stringify(stored["land.png"])} }],
      ["connections:list"], ["saves:list"], ["settings:get"], ["connections:reveal", "x", "db.password"],
      ["media:ingest", { entryId: ${entryId}, sources: [] }], ["media:ingestStatus"], ["media:driveInfo"], ["media:setDriveLabel", "x"]]) {
      r[ch] = await window.raw.invoke(ch, ...args).then(() => "통과", () => "거절");
    }
    r.port = window.raw.sendSync("session:port");
    r.token = window.raw.sendSync("session:token");
    r.bg = window.raw.sendSync("background:get");
    return r;
  })()`);
  raw.destroy();
  check("IPC 발신자 검사 — 남의 문서의 invoke는 전부 거절 (media·connections·saves·settings)",
    ["media:copy", "connections:list", "saves:list", "settings:get", "connections:reveal", "media:ingest", "media:ingestStatus",
      "media:driveInfo", "media:setDriveLabel"].every((k) => rawResults[k] === "거절"), JSON.stringify(rawResults));
  check("IPC 발신자 검사 — 동기 IPC(포트·토큰·배경)도 null", rawResults.port === null && rawResults.token === null && rawResults.bg === null);

  // ── 폴더로 저장 (대화상자는 바꿔 끼운다 — 매번 고르는지 센다) ──
  const exportDir = path.join(TMP, "export");
  fs.mkdirSync(exportDir);
  let asked = 0;
  realElectron.dialog.showOpenDialog = async () => { asked++; return { canceled: false, filePaths: [exportDir] }; };
  const refs = JSON.stringify([stored["land.png"], stored["clip.mp4"], "nope.png"].map((fileName) => ({ entryId, fileName })));
  const s1 = await js(`window.starlog.media.saveTo(${refs})`);
  const s2 = await js(`window.starlog.media.saveTo(${refs})`);
  const files = fs.readdirSync(exportDir).sort();
  check("저장 — 폴더를 매번 묻는다", asked === 2);
  check("저장 — 고른 것 복사, 없는 것은 failed", s1.saved?.length === 2 && s1.failed?.[0]?.reason === "NOT_FOUND", JSON.stringify(s1));
  check("저장 — 이름이 겹치면 (1)을 붙인다", s2.saved?.every((x) => / \(1\)\./.test(x.savedAs)) && files.length === 4, files.join(","));
  const keptTime = fs.statSync(path.join(exportDir, stored["land.png"])).mtimeMs;
  check("저장 — 찍은 시각을 옮긴다", Math.abs(keptTime - 1700000003000) <= 1, String(keptTime));
  realElectron.dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  check("저장 — 취소", (await js(`window.starlog.media.saveTo(${refs})`)).canceled === true);

  // ── 지우면 썸네일도 ──
  const del = await api(port, "POST", `/api/backlog/${entryId}/screenshots/delete`, [stored["land.png"], stored["clip.mp4"]]);
  const left = fs.existsSync(thumbsDir) ? fs.readdirSync(thumbsDir) : [];
  check("삭제 — 원본과 썸네일이 함께 사라진다", del.json?.deleted === 2
    && !fs.existsSync(path.join(folder, stored["land.png"])) && !left.includes(`${stored["land.png"]}.jpg`) && !left.includes(`${stored["clip.mp4"]}.jpg`),
  left.join(","));
}

// ── starlog-media:// (메인이 디스크에서 바로 내준다) · 뷰어 ──

async function mediaProtocolSteps(port, entryId, folder, stored, items) {
  const { net, nativeImage } = realElectron;
  const get = async (u, headers = {}) => {
    try {
      const r = await net.fetch(u, { headers });
      return { status: r.status, type: r.headers.get("content-type"), range: r.headers.get("content-range"), body: Buffer.from(await r.arrayBuffer()) };
    } catch (e) { return { status: -1, error: String(e?.message ?? e) }; }
  };
  const slug = encodeURIComponent(path.basename(folder));
  const at = (kind, f, n) => `starlog-media://${kind}/${f}/${n}`;
  const land = encodeURIComponent(stored["land.png"]);
  const shot = await get(at("shot", slug, land));
  check("프로토콜 — 원본 (image/png, 파일 그대로)", shot.status === 200 && shot.type === "image/png"
    && shot.body.equals(fs.readFileSync(path.join(folder, stored["land.png"]))), `${shot.status} ${shot.type}`);
  fs.rmSync(path.join(folder, ".thumbs", `${stored["square.png"]}.jpg`), { force: true });
  const th = await get(at("thumb", slug, encodeURIComponent(stored["square.png"])));
  const thSize = th.body ? nativeImage.createFromBuffer(th.body).getSize() : null;
  check("프로토콜 — 썸네일이 없으면 그 요청에서 만든다 (image/jpeg 480)", th.status === 200 && th.type === "image/jpeg" && thSize?.width === 480,
    `${th.status} ${JSON.stringify(thSize)}`);
  const clip = encodeURIComponent(stored["clip.mp4"]);
  const size = fs.statSync(path.join(folder, stored["clip.mp4"])).size;
  const part = await get(at("shot", slug, clip), { Range: "bytes=0-99" });
  const tail = await get(at("shot", slug, clip), { Range: "bytes=-10" });
  const bad = await get(at("shot", slug, clip), { Range: `bytes=${size + 5}-` });
  check("프로토콜 — 영상 Range (206·Content-Range, 끝 구간, 범위 밖 416)",
    part.status === 206 && part.body.length === 100 && part.range === `bytes 0-99/${size}` && part.type === "video/mp4"
      && tail.status === 206 && tail.body.length === 10 && bad.status === 416, `${part.status} ${part.range} ${tail.status} ${bad.status}`);

  // 거절 — 전부 404. 밖의 파일·링크·썸네일 폴더·하위 경로·모르는 형식·윈도우식 이름
  const outside = path.join(TMP, "outside-proto.png");
  fs.copyFileSync(path.join(folder, stored["square.png"]), outside);
  fs.symlinkSync(outside, path.join(folder, "link-proto.png"));
  fs.writeFileSync(path.join(folder, "notes.txt"), "hello");
  fs.writeFileSync(path.join(folder, "fake.txt.png"), "x");
  fs.mkdirSync(path.join(folder, "sub"), { recursive: true });
  fs.copyFileSync(outside, path.join(folder, "sub", "in-sub.png"));
  const otherRoot = path.join(TMP, "appData/starlog/data/covers");
  const tries = {
    traversal: at("shot", slug, "..%2F..%2Fsaves"),
    dotdot: `starlog-media://shot/${slug}/../../outside-proto.png`,
    backslash: at("shot", slug, "..%5C..%5Coutside-proto.png"),
    encodedSlash: at("shot", `${slug}%2Fsub`, "in-sub.png"),
    sub: `starlog-media://shot/${slug}/sub/in-sub.png`,
    symlink: at("shot", slug, "link-proto.png"),
    thumbsDir: at("shot", ".thumbs", land + ".jpg"),
    thumbsAsFile: at("shot", slug, encodeURIComponent(`.thumbs/${stored["land.png"]}.jpg`)),
    unknownType: at("shot", slug, "notes.txt"),
    ads: at("shot", slug, `${land}%3Astream`),
    trailingDot: at("shot", slug, `${land}.`),
    nul: at("shot", slug, `${land}%00.png`),
    otherHost: `starlog-media://evil/${slug}/${land}`,
    absolute: at("shot", encodeURIComponent(otherRoot), land),
    missing: at("thumb", slug, "nope.png"),
  };
  const got = {};
  for (const [k, u] of Object.entries(tries)) got[k] = (await get(u)).status;
  check("프로토콜 — 경로 탈출·링크·하위 폴더·.thumbs·모르는 형식·ADS·끝 점·NUL·다른 호스트는 전부 404",
    Object.values(got).every((x) => x === 404), JSON.stringify(got));
  const post = await net.fetch(at("shot", slug, land), { method: "POST", body: "x" }).then((r) => r.status, () => -1);
  check("프로토콜 — GET·HEAD만", post === 405 || post === -1, String(post));
  const fake = await get(at("shot", slug, "fake.txt.png"));
  check("프로토콜 — Content-Type은 확장자로, nosniff", fake.status === 200 && fake.type === "image/png", `${fake.status} ${fake.type}`);
  fs.rmSync(path.join(folder, "link-proto.png"));
  fs.rmSync(path.join(folder, "notes.txt"));
  fs.rmSync(path.join(folder, "fake.txt.png"));
  fs.rmSync(path.join(folder, "sub"), { recursive: true });

  // 창에서 실제로 그려지는가 (CSP img-src starlog-media:)
  const drawn = await js(`new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(-1); i.src = ${JSON.stringify(items.find((i) => i.fileName === stored["land.png"]).thumbUrl)}; })`);
  check("프로토콜 — app:// 창의 <img>가 그린다 (CSP)", drawn === 480, String(drawn));

  await viewerSteps(entryId);
}

/** 뷰어 — 누르고 있기는 초당 ~8장(120ms), 열면 진행 방향 원본을 미리 받는다 */
async function viewerSteps(entryId) {
  await goto(`app://starlog/library/detail?entry=${entryId}`);
  await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "전체 화면").click()`);
  await sleep(800);
  const tiles = await js(`document.querySelectorAll('[aria-label="스크린샷 갤러리"] .grid button[aria-label]').length`);
  mediaRequests.length = 0;
  await js(`document.querySelectorAll('[aria-label="스크린샷 갤러리"] .grid button[aria-label]')[0].click()`);
  await sleep(1200);
  const prefetched = mediaRequests.filter((u) => u.startsWith("starlog-media://shot/")).map((u) => decodeURIComponent(u.split("/").pop().split("?")[0]));
  const items = await js(`(async () => (await (await fetch("http://127.0.0.1:" + window.starlog.backendPort() + "/api/screenshots", { headers: { "X-Starlog-Token": window.starlog.session.token() } })).json()).items.map((i) => [i.fileName, i.kind]))()`);
  // 0번을 열었다 → 1·2·3번(영상은 빼고) + 맨 끝 한 장
  const want = [1, 2, 3, items.length - 1].map((i) => items[i]).filter((x) => x && x[1] === "IMAGE").map((x) => x[0]);
  check("뷰어 — 열면 이웃 원본을 미리 받는다 (진행 방향 3 + 반대 1, 영상 제외)",
    want.length > 0 && want.every((n) => prefetched.includes(n)), `타일 ${tiles} · 받음 ${prefetched.join(",")} · 기대 ${want.join(",")}`);
  const hold = await js(`(async () => {
    const viewer = () => [...document.querySelectorAll('[role=dialog][aria-modal=true]')].find((x) => x.className.includes('z-[200]'));
    let steps = 0, last = viewer()?.getAttribute('aria-label'); const at = [];
    const mo = new MutationObserver(() => { const l = viewer()?.getAttribute('aria-label'); if (l !== last) { steps++; last = l; at.push(performance.now()); } });
    mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['aria-label'] });
    const t0 = performance.now(); let i = 0;
    while (performance.now() - t0 < 1000) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: i++ > 0, bubbles: true })); await new Promise((r) => setTimeout(r, 33)); }
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    await new Promise((r) => setTimeout(r, 50));
    mo.disconnect();
    const gaps = at.slice(1).map((x, k) => Math.round(x - at[k]));
    return { events: i, steps, minGap: gaps.length ? Math.min(...gaps) : null };
  })()`);
  check("뷰어 — 누르고 있으면 초당 ~8장 (120ms 간격, 키 반복 30/s를 거른다)",
    hold.events >= 20 && hold.steps >= 6 && hold.steps <= 10 && hold.minGap >= 100, JSON.stringify(hold));
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(200);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
}

/**
 * 배경 일 — 서버를 내린 사이 탐색기로 넣은 파일을 다음 세션이 알아서 만든다, 주소는 기동이 바뀌어도 같다,
 * 세션 중에 넣은 파일은 감시가 잡는다
 */
async function mediaBackgroundSteps(save, entryId) {
  const folder = path.join(MEDIA_ROOT, fs.readdirSync(MEDIA_ROOT).filter((n) => !n.startsWith("."))[0]);
  let port = await js("window.starlog.backendPort()");
  const before = (await api(port, "GET", `/api/backlog/${entryId}/screenshots`)).json;
  const sample = before.find((i) => i.contentType === "image/png") ?? before[0];
  await js("window.starlog.cancelLaunch()");   // 서버를 내린다 (= 앱을 끈 사이)
  const src = path.join(folder, sample.fileName);
  for (let i = 1; i <= 24; i++) fs.copyFileSync(src, path.join(folder, `drop-${String(i).padStart(2, "0")}.png`));
  fs.rmSync(path.join(folder, ".thumbs"), { recursive: true, force: true });
  await js(`window.__media = { progress: [], changed: [] }; window.starlog.media.onProgress((p) => __media.progress.push(p)); window.starlog.media.onChanged((c) => __media.changed.push(c)); 0`);
  // 숨긴 창은 포커스가 없다 — 배경 일은 사용자가 STARLOG를 보고 있을 때만 돈다 (`mediaGate.js`). 보고 있다고 친다
  win.emit("focus");
  const l = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} })`);
  port = l.port;
  const total = fs.readdirSync(folder).filter((n) => !n.startsWith(".")).length;
  const countThumbs = () => (fs.existsSync(path.join(folder, ".thumbs")) ? fs.readdirSync(path.join(folder, ".thumbs")).filter((f) => f.endsWith(".jpg")).length : 0);
  const t0 = Date.now();
  // 깨진 파일 하나는 못 만든다
  while (Date.now() - t0 < 20000 && countThumbs() < total - 1) await sleep(200);
  await sleep(1200);
  const progress = await js("__media.progress");
  check("배경 썸네일 — 서버가 없던 사이 넣은 파일·지운 썸네일을 세션을 열면 채운다", countThumbs() >= total - 1, `${countThumbs()}/${total} ${Date.now() - t0}ms`);
  check("배경 썸네일 — 진행 알림 (run → done, total)", progress.some((p) => p.phase === "run") && progress.at(-1)?.phase === "done" && progress.at(-1)?.total >= 24,
    JSON.stringify(progress.slice(-2)));
  const index = JSON.parse(fs.readFileSync(path.join(folder, ".thumbs", "index.json"), "utf8"));
  const after = (await api(port, "GET", `/api/backlog/${entryId}/screenshots`)).json;
  check("폴더 색인 — 도장이 찍히고 목록에 자리표시·크기가 실린다", index.dir !== null && after.filter((i) => i.placeholder).length >= total - 1
    && after.find((i) => i.fileName === "drop-01.png")?.width > 0, `dir=${JSON.stringify(index.dir)} ph=${after.filter((i) => i.placeholder).length}`);
  const again = after.find((i) => i.fileName === sample.fileName);
  check("썸네일 주소가 다시 켜도 같다 (포트·토큰 없음)", again?.thumbUrl === sample.thumbUrl && again?.url === sample.url && l.port !== undefined, `${sample.thumbUrl} → ${again?.thumbUrl}`);

  // 세션 중에 탐색기로 넣기 → 감시가 잡아 썸네일을 만들고 화면에 알린다
  await js("__media.changed.length = 0");
  fs.copyFileSync(src, path.join(folder, "watched.png"));
  const thumb = path.join(folder, ".thumbs", "watched.png.jpg");
  const w0 = Date.now();
  while (Date.now() - w0 < 8000 && !fs.existsSync(thumb)) await sleep(100);
  await sleep(300);
  const changed = await js("__media.changed");
  check("감시 — 넣은 파일의 썸네일이 바로 생기고 화면에 '바뀜'을 알린다", fs.existsSync(thumb) && changed.length >= 1, `${Date.now() - w0}ms ${JSON.stringify(changed)}`);
  // 다른 창(게임)으로 가면 배경 썸네일이 멈추고, 돌아오면 이어서 한다. 화면이 부르는 썸네일이 섞이지 않게 대시보드로
  await goto("app://starlog/dashboard");
  await js("window.starlog.cancelLaunch()");
  for (let i = 1; i <= 24; i++) fs.copyFileSync(src, path.join(folder, `drop2-${String(i).padStart(2, "0")}.png`));
  fs.rmSync(path.join(folder, ".thumbs"), { recursive: true, force: true });
  win.emit("blur");
  const l2 = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} })`);
  port = l2.port;
  await sleep(4000);
  const whileAway = countThumbs();
  win.emit("focus");
  const f0 = Date.now();
  const total2 = fs.readdirSync(folder).filter((n) => !n.startsWith(".")).length;
  while (Date.now() - f0 < 20000 && countThumbs() < total2 - 1) await sleep(200);
  check("배경 썸네일 — 창이 포커스를 잃으면 멈추고(4초간 0장), 돌아오면 이어서 채운다",
    whileAway === 0 && countThumbs() >= total2 - 1, `떠나 있는 동안 ${whileAway}장 → 돌아와서 ${countThumbs()}/${total2} ${Date.now() - f0}ms`);
  for (const f of fs.readdirSync(folder)) if (/^drop2?-\d+\.png$|^watched\.png$/.test(f)) fs.rmSync(path.join(folder, f));
  return port;
}


// ── 스크린샷 넣기 (ingest.js) — 경로로 받아 메인이 복사·검증·커밋, 전부 아니면 전혀 ──
async function ingestSteps(save, entryId) {
  const crypto = require("crypto");
  const folder = path.join(MEDIA_ROOT, fs.readdirSync(MEDIA_ROOT).filter((n) => !n.startsWith("."))[0]);
  const src = path.join(TMP, "ingest-src");
  fs.mkdirSync(src, { recursive: true });
  const { nativeImage } = realElectron;
  const noise = (w, h) => { const b = Buffer.alloc(w * h * 4); crypto.randomFillSync(b); for (let i = 3; i < b.length; i += 4) b[i] = 255; return nativeImage.createFromBitmap(b, { width: w, height: h }); };
  const small = (c) => { const b = Buffer.alloc(16 * 16 * 4, c); return nativeImage.createFromBitmap(b, { width: 16, height: 16 }).toPNG(); };
  const bigPng = path.join(src, "big4k.png");
  fs.writeFileSync(bigPng, noise(3000, 3000).toPNG());   // 20MB 넘는 4K급 — 예전엔 이 한 장에서 멈췄다
  const aJpg = path.join(src, "a.jpg"), cPng = path.join(src, "c.png");
  fs.writeFileSync(aJpg, nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 90), { width: 16, height: 16 }).toJPEG(80));
  fs.writeFileSync(cPng, small(200));
  const sec = (s) => new Date(s * 1000);
  fs.utimesSync(bigPng, sec(1_600_000_002), sec(1_600_000_002));
  fs.utimesSync(cPng, sec(1_600_000_001), sec(1_600_000_001));
  fs.utimesSync(aJpg, sec(1_600_000_009), sec(1_600_000_009));   // takenAt이 더 이르다
  check("시험 파일 — 큰 PNG가 20MB를 넘는다", fs.statSync(bigPng).size > 20 * 1024 * 1024, `${(fs.statSync(bigPng).size / 1048576).toFixed(1)}MB`);

  await js(`window.__ing = []; window.starlog.media.onIngest((j) => __ing.push(j)); 0`);
  const listNames = async () => (await api(await js("window.starlog.backendPort()"), "GET", `/api/backlog/${entryId}/screenshots`)).json.map((i) => i.fileName);
  const waitJob = async (batchId, ms = 60000) => {
    const t0 = Date.now();
    for (;;) {
      const job = (await js("window.starlog.media.ingestStatus()")).find((j) => j.batchId === batchId);
      if (job && !["copying", "verifying", "committing"].includes(job.phase)) return job;
      if (Date.now() - t0 > ms) return job ?? null;
      await sleep(50);
    }
  };
  const incomingGone = () => !fs.existsSync(path.join(folder, ".incoming"));
  const before = await listNames();

  // 1) 성공 — 큰 파일 포함 3개, 시각 순으로 번호가 이어진다
  const { batchId } = await js(`window.starlog.media.ingest(${JSON.stringify({ entryId, sources: [aJpg, bigPng, cPng, aJpg],
    takenAt: { [aJpg]: 1_500_000_000_000 } })})`);
  check("넣기 — 바로 batchId를 돌려준다 (UUID)", /^[0-9a-f-]{36}$/.test(batchId), batchId);
  const job = await waitJob(batchId);
  const after = await listNames();
  const added = after.filter((n) => !before.includes(n)).sort();
  check("넣기 — 3개 모두 들어갔다 (중복 경로는 한 번으로)", job?.phase === "done" && job.total === 3 && job.committed.length === 3 && added.length === 3,
    JSON.stringify({ phase: job?.phase, total: job?.total, committed: job?.committed, failures: job?.failures }));
  const nextNum = Math.max(...before.map((n) => parseInt(n, 10) || 0)) + 1;
  check("넣기 — 기존 최대 번호 다음부터 이어 붙는다 (시각 순: a → c → 큰 것)",
    JSON.stringify(job?.committed.map((n) => parseInt(n, 10))) === JSON.stringify([nextNum, nextNum + 1, nextNum + 2])
    && job.committed[0].endsWith(".jpg") && job.committed[1].endsWith(".png"), JSON.stringify(job?.committed));
  const same = (a, b) => crypto.createHash("sha256").update(fs.readFileSync(a)).digest("hex") === crypto.createHash("sha256").update(fs.readFileSync(b)).digest("hex");
  check("넣기 — 내용이 원본과 같다 (큰 PNG 포함)", same(bigPng, path.join(folder, job.committed[2])) && same(cPng, path.join(folder, job.committed[1])));
  const mt = (n) => Math.round(fs.statSync(path.join(folder, n)).mtimeMs);
  check("넣기 — 수정시각 보존 (takenAt 우선, 없으면 원본)", mt(job.committed[0]) === 1_500_000_000_000 && mt(job.committed[1]) === 1_600_000_001_000
    && mt(job.committed[2]) === 1_600_000_002_000, `${mt(job.committed[0])} ${mt(job.committed[1])} ${mt(job.committed[2])}`);
  check("넣기 — 원본은 그대로 남는다 · .incoming은 비었다", fs.existsSync(bigPng) && fs.existsSync(cPng) && incomingGone());
  const seen = (await js("__ing")).filter((j) => j.batchId === batchId);
  const phases = [...new Set(seen.map((j) => j.phase))];
  check("넣기 — 진행 알림 (copying → verifying → committing → done), 바이트가 단조 증가",
    JSON.stringify(phases) === JSON.stringify(["copying", "verifying", "committing", "done"])
    && seen.every((j, i) => i === 0 || j.bytesDone >= seen[i - 1].bytesDone) && seen.at(-1).bytesDone === seen.at(-1).bytesTotal && seen[0].bytesTotal > 20 * 1024 * 1024,
    `${phases.join(">")} ${seen.length}건`);
  check("넣기 — 진행 알림은 쓰로틀 (초당 ~5건 이하)", seen.length < 60, String(seen.length));
  const status = await js("window.starlog.media.ingestStatus()");
  check("넣기 — 상태는 메인에 남는다 (화면을 떠났다 와도)", status.some((j) => j.batchId === batchId && j.phase === "done"));
  const listed = (await api(await js("window.starlog.backendPort()"), "GET", `/api/backlog/${entryId}/screenshots`)).json;
  check("넣기 — 목록에 찍은 시각이 실린다", Math.abs(Date.parse(listed.find((i) => i.fileName === job.committed[0]).takenAt) - 1_500_000_000_000) < 1000);

  // 2) 롤백 — 중간에 원본이 사라지면 아무것도 안 들어간다
  const gone = path.join(src, "gone.png");
  fs.writeFileSync(gone, small(10));
  const r1 = await js(`window.starlog.media.ingest(${JSON.stringify({ entryId, sources: [bigPng, gone] })})`);
  fs.rmSync(gone);
  const rolled = await waitJob(r1.batchId);
  await sleep(300);
  check("롤백 — 복사 중 원본이 사라지면 rolledBack, 실패 원본을 알려 준다",
    rolled?.phase === "rolledBack" && rolled.failures.length === 1 && rolled.failures[0].source === gone && rolled.committed.length === 0, JSON.stringify(rolled));
  check("롤백 — 아무것도 커밋되지 않았고 .incoming이 없다", (await listNames()).length === after.length && incomingGone());

  // 2-1) 서브밀리초 mtime — 실제 파일은 거의 다 소수 ms다. 예전엔 Date(정수)와 비교해 전부 롤백됐다
  const frac = path.join(src, "frac.png");
  fs.writeFileSync(frac, small(77));
  fs.utimesSync(frac, 1_600_000_500.123457, 1_600_000_500.123457);
  const fracNat = path.join(src, "frac-natural.png");
  fs.writeFileSync(fracNat, small(78));   // utimes 없이 — 파일시스템이 준 그대로
  const r3 = await js(`window.starlog.media.ingest(${JSON.stringify({ entryId, sources: [frac, fracNat] })})`);
  const fracJob = await waitJob(r3.batchId);
  check("서브밀리초 mtime — 롤백되지 않고 커밋된다", fracJob?.phase === "done" && fracJob.committed.length === 2 && incomingGone(), JSON.stringify(fracJob));
  for (const n of fracJob?.committed ?? []) fs.rmSync(path.join(folder, n), { force: true });   // 뒤 단계의 개수 계산을 안 흔든다

  // 3) 공간 부족 — 시험용 환경변수로 남은 공간을 박는다
  process.env.STARLOG_INGEST_FREE_BYTES = String(100 * 1024 * 1024);
  const r2 = await js(`window.starlog.media.ingest(${JSON.stringify({ entryId, sources: [cPng] })})`);
  const noSpace = await waitJob(r2.batchId);
  delete process.env.STARLOG_INGEST_FREE_BYTES;
  check("공간 부족 — 복사 전에 failed, 필요/남음을 말한다", noSpace?.phase === "failed" && /공간 부족: 필요 .* \/ 남음 /.test(noSpace.message ?? "") && noSpace.bytesDone === 0 && incomingGone(),
    JSON.stringify(noSpace));

  // 4) 요청 검사
  const bad = await js(`window.starlog.media.ingest(${JSON.stringify({ entryId, sources: [cPng, src, "relative.png", path.join(src, "nope.png"), path.join(src, "x.txt")] })})`);
  fs.writeFileSync(path.join(src, "x.txt"), "x");
  const badJob = await waitJob(bad.batchId);
  check("검사 — 폴더·상대 경로·없는 파일이 섞이면 아무것도 안 넣고 failed (사유 목록)",
    badJob?.phase === "failed" && badJob.failures.length >= 3 && badJob.committed.length === 0 && (await listNames()).length === after.length, JSON.stringify(badJob?.failures));
  const rejects = [];
  for (const req of [{ entryId: 0, sources: [cPng] }, { entryId: "1", sources: [cPng] }, { entryId, sources: [] }, { entryId, sources: "x" }, null]) {
    rejects.push(await js(`window.starlog.media.ingest(${JSON.stringify(req)}).then(() => "통과", () => "거절")`));
  }
  check("검사 — 잘못된 entryId·빈 목록·모양이 틀린 요청은 거절", rejects.every((x) => x === "거절"), rejects.join(","));

  // 5) 같은 폴더는 한 번에 하나 — 둘을 연달아 넣으면 순서대로 모두 들어간다
  const p1 = path.join(src, "q1.png"), p2 = path.join(src, "q2.png");
  fs.writeFileSync(p1, small(11)); fs.writeFileSync(p2, small(12));
  fs.utimesSync(p1, sec(1_600_000_100), sec(1_600_000_100)); fs.utimesSync(p2, sec(1_600_000_050), sec(1_600_000_050));
  const [j1, j2] = [await js(`window.starlog.media.ingest(${JSON.stringify({ entryId, sources: [bigPng, p1] })})`),
    await js(`window.starlog.media.ingest(${JSON.stringify({ entryId, sources: [p2] })})`)];
  const [d1, d2] = [await waitJob(j1.batchId), await waitJob(j2.batchId)];
  check("대기열 — 같은 폴더의 두 묶음이 겹치지 않고 차례로 들어간다 (번호가 묶음 순서대로)",
    d1?.phase === "done" && d2?.phase === "done" && parseInt(d2.committed[0], 10) === parseInt(d1.committed.at(-1), 10) + 1
    && (await listNames()).length === after.length + 3, `${d1?.committed} | ${d2?.committed}`);

  // 6) 드라이브 정보·이름표
  const di = await js("window.starlog.media.driveInfo()");
  check("드라이브 — root·freeBytes·totalBytes (label은 처음엔 null)",
    typeof di.root === "string" && di.root.length > 0 && di.freeBytes > 0 && di.totalBytes >= di.freeBytes && di.label === null, JSON.stringify(di));
  await js(`window.starlog.media.setDriveLabel("  내 HDD (D:)  ")`);
  const di2 = await js("window.starlog.media.driveInfo()");
  const settingsFile = JSON.parse(fs.readFileSync(path.join(TMP, "appData/starlog/settings.json"), "utf8"));
  check("드라이브 — 이름표는 다듬어 저장되고 settings.json에 데이터 루트 키로 남는다",
    di2.label === "내 HDD (D:)" && Object.values(settingsFile.driveLabels ?? {}).includes("내 HDD (D:)"), JSON.stringify(settingsFile.driveLabels));
  const labelBad = [];
  for (const v of ["x".repeat(41), "a\u0007b", 5]) labelBad.push(await js(`window.starlog.media.setDriveLabel(${JSON.stringify(v)}).then(() => "통과", () => "거절")`));
  check("드라이브 — 41자·제어문자·문자열이 아닌 값은 거절", labelBad.every((x) => x === "거절") && (await js("window.starlog.media.driveInfo()")).label === "내 HDD (D:)", labelBad.join(","));
  await js(`window.starlog.media.setDriveLabel(null)`);
  check("드라이브 — null이면 이름표를 지운다", (await js("window.starlog.media.driveInfo()")).label === null);

  // 7) .incoming은 목록·프로토콜에 안 나오고, 한 시간 넘은 것만 세션을 열 때 치운다
  const stale = path.join(folder, ".incoming", "11111111-1111-4111-8111-111111111111");
  const fresh = path.join(folder, ".incoming", "22222222-2222-4222-8222-222222222222");
  for (const d of [stale, fresh]) { fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(cPng, path.join(d, "0000.png")); }
  const old = new Date(Date.now() - 2 * 3600_000);
  fs.utimesSync(stale, old, old);
  check("정리 — .incoming 안 파일은 목록에 안 나온다", (await listNames()).length === after.length + 3 && !(await listNames()).some((n) => n.startsWith("0000")));
  const outside = await fetch(`starlog-media://shot/${encodeURIComponent(path.basename(folder))}/.incoming/22222222-2222-4222-8222-222222222222/0000.png`).then((r) => r.status, () => -1);
  check("정리 — starlog-media는 .incoming을 안 내준다", outside === 404 || outside === -1, String(outside));
  await js("window.starlog.cancelLaunch()");
  const re = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} })`);
  check("정리 — 세션을 열 때 한 시간 넘은 묶음만 지운다", re.ok && !fs.existsSync(stale) && fs.existsSync(fresh), `${re.ok} stale=${fs.existsSync(stale)} fresh=${fs.existsSync(fresh)}`);
  fs.rmSync(path.join(folder, ".incoming"), { recursive: true, force: true });

  // 8) 화면 끝에서 끝까지 — 입력 칸에 진짜 파일을 넣으면(CDP) 화면이 경로를 뽑아 ingest → 알림 → 목록 다시 읽기
  const port2 = re.port;
  const e2eFile = path.join(src, "ui-drop.png");
  fs.writeFileSync(e2eFile, noise(64, 64).toPNG());
  fs.utimesSync(e2eFile, sec(1_600_000_300), sec(1_600_000_300));
  await goto(`app://starlog/library/detail?entry=${entryId}`);
  const namesBefore = (await api(port2, "GET", `/api/backlog/${entryId}/screenshots`)).json.map((i) => i.fileName);
  const dbg = win.webContents.debugger;
  dbg.attach("1.3");
  try {
    const marked = await js(`(() => { const i = [...document.querySelectorAll('input[type=file][multiple]')][0]; if (!i) return false; i.setAttribute('data-e2e', 'shots'); return true; })()`);
    check("화면 — 스크린샷 파일 입력 칸이 있다", marked === true);
    const doc = await dbg.sendCommand("DOM.getDocument", { depth: 0 });
    const { nodeId } = await dbg.sendCommand("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "input[data-e2e=shots]" });
    await dbg.sendCommand("DOM.setFileInputFiles", { nodeId, files: [e2eFile] });
  } finally {
    // 입력 칸 설정이 끝났으면 분리 — 이후 단계에 영향이 없게
  }
  const t8 = Date.now();
  let toast = "", names8 = namesBefore;
  while (Date.now() - t8 < 20000) {
    toast = await js("document.body.innerText");
    names8 = (await api(port2, "GET", `/api/backlog/${entryId}/screenshots`)).json.map((i) => i.fileName);
    if (/1장 넣음/.test(toast) && names8.length === namesBefore.length + 1) break;
    await sleep(150);
  }
  try { dbg.detach(); } catch { /* 이미 분리 */ }
  check("화면 — 파일을 넣으면 메인이 받아 알림('1장 넣음')이 뜬다", /1장 넣음/.test(toast), toast.split("\n").filter((l) => /넣/.test(l)).join(" | "));
  const tiles = await js(`document.querySelectorAll('img[src^="starlog-media://"], [data-testid=shot], button img').length`);
  check("화면 — 끝나면 목록을 다시 읽어 새 장이 들어온다", names8.length === namesBefore.length + 1, `${namesBefore.length} → ${names8.length}, 화면 img ${tiles}`);
  return port2;
}

// ── 보안 점검 회귀 (2026-10-25): 창 이동 잠금 · 새 창 · 권한 · 마크다운 · 데이터 루트 · openPath ──

async function securitySteps(port) {
  const http = require("http");
  const evil = http.createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end("<html><body>evil</body></html>"); });
  await new Promise((r) => evil.listen(0, "127.0.0.1", r));
  const EVIL = `http://127.0.0.1:${evil.address().port}/`;
  try {
    const token = await js("window.starlog.session.token()");
    check("토큰 — 다리가 지금 서버의 토큰을 준다", typeof token === "string" && token.length >= 43, `${String(token).length}자`);

    await goto("app://starlog/dashboard");
    shellCalls.length = 0;
    await js(`location.href = ${JSON.stringify(EVIL)}`);
    await sleep(800);
    check("창 이동 잠금 — location.href로 남의 페이지에 못 간다", win.webContents.getURL().startsWith("app://starlog/"), win.webContents.getURL());
    check("창 이동 잠금 — 밖으로 가려던 http는 기본 브라우저로", shellCalls.some(([k, u]) => k === "openExternal" && u === EVIL), JSON.stringify(shellCalls));
    await js(`(() => { const a = document.createElement("a"); a.href = ${JSON.stringify(EVIL + "click")}; document.body.append(a); a.click(); })()`);
    await sleep(800);
    check("창 이동 잠금 — 링크 클릭도", win.webContents.getURL().startsWith("app://starlog/"), win.webContents.getURL());
    shellCalls.length = 0;
    // 파일을 떨어뜨렸을 때와 같은 길 (file:// 이동)
    await js(`location.href = "file:///etc/hosts"`);
    await sleep(800);
    check("창 이동 잠금 — file:// (끌어놓기)도 막고 OS에 안 넘긴다", win.webContents.getURL().startsWith("app://starlog/") && shellCalls.length === 0, JSON.stringify(shellCalls));

    shellCalls.length = 0;
    await js(`window.open("smb://203.0.113.9/share"); window.open("file:///System/Applications/Calculator.app"); window.open("x-apple.systempreferences:x"); window.open("https://example.com/ok")`);
    await sleep(500);
    check("window.open — smb:·file:·앱 스킴은 OS로 안 가고 https만 기본 브라우저로",
      JSON.stringify(shellCalls) === JSON.stringify([["openExternal", "https://example.com/ok"]]), JSON.stringify(shellCalls));

    const perm = await js(`(async () => ({
      notif: await Notification.requestPermission(),
      geo: (await navigator.permissions.query({ name: "geolocation" })).state,
      clip: await navigator.clipboard.readText().then(() => "granted", () => "denied"),
    }))()`);
    check("권한 — 알림·위치·클립보드 읽기 거절", perm.notif === "denied" && perm.geo === "denied" && perm.clip === "denied", JSON.stringify(perm));

    // 메인이 직접 남의 페이지를 띄운 경우까지 — 다리가 없어야 한다 (두 번째 울타리)
    await win.loadURL(EVIL);
    await sleep(300);
    check("남의 페이지에는 다리(window.starlog)가 없다", (await js("typeof window.starlog")) === "undefined");
    await goto("app://starlog/dashboard");

    // 마크다운 — 링크는 새 창(→ 기본 브라우저), 외부 이미지는 안 불러온다
    const memo = `[공략](${EVIL}guide) ![추적](${EVIL}track.png) ![커버](https://images.igdb.com/igdb/image/upload/t_thumb/x.jpg) [js](javascript:alert(1)) [파일](file:///etc/passwd)`;
    const put = await api(port, "PUT", "/api/me/profile", { nickname: "e2e", memo });
    await goto("app://starlog/settings");
    const md = await js(`(() => {
      const root = [...document.querySelectorAll(".markdown")].find((el) => el.textContent.includes("공략"));
      if (!root) return null;
      return { a: [...root.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href"), a.target]),
               img: [...root.querySelectorAll("img")].map((i) => i.getAttribute("src")) };
    })()`);
    check("마크다운 — 링크는 http(s)만, 전부 새 창", md !== null && md.a.every(([, h, t]) => /^https?:/.test(h) && t === "_blank")
      && !md.a.some(([, h]) => /^(javascript|file):/.test(h)), `${put.status} ${JSON.stringify(md)}`);
    check("마크다운 — 외부 이미지는 링크 글자로, IGDB만 그림으로",
      md !== null && md.img.length === 1 && md.img[0].startsWith("https://images.igdb.com/") && md.a.some(([t]) => t === "추적"), JSON.stringify(md?.img));
  } finally {
    evil.close();
  }
}

// ── CSP (보안 점검 3단계, 2026-10-25) ──

/** 창 콘솔에 찍힌 CSP 위반. 크로미움은 막을 때마다 콘솔에 "Content Security Policy"를 남긴다 */
const cspViolations = [];
function watchCsp() {
  win.webContents.on("console-message", (e, _level, message) => {
    const msg = String(e?.message ?? message ?? "");
    if (/Content Security Policy/i.test(msg)) cspViolations.push(`${win.webContents.getURL()} :: ${msg.slice(0, 300)}`);
  });
}
const cspHeader = () => js("fetch(location.href).then((r) => r.headers.get('content-security-policy'))");

async function cspSteps(port, entryId) {
  const csp = require(path.join(ROOT, "desktop/csp.js"));
  const appCsp = await cspHeader();
  const has = (p, d, v) => new RegExp(`(^|; )${d} [^;]*${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(p ?? "");
  check("CSP — app:// 문서에 헤더 (script-src는 'self'+해시, unsafe-inline·unsafe-eval 없음)",
    !!appCsp && has(appCsp, "script-src", "'sha256-") && !/unsafe-(inline|eval)/.test(appCsp)
      && has(appCsp, "object-src", "'none'") && has(appCsp, "frame-ancestors", "'none'") && has(appCsp, "base-uri", "'none'"), appCsp);

  // 서버가 서빙하는 http 사본 — 같은 정책, 해시는 그 바이트에서
  const res = await fetch(`http://127.0.0.1:${port}/dashboard`);
  const html = await res.text();
  const httpCsp = res.headers.get("content-security-policy");
  const hashes = csp.inlineScriptHashes(html);
  check("CSP — http 사본에도 헤더, 인라인 스크립트 해시가 본문과 맞다",
    res.status === 200 && hashes.length >= 2 && hashes.every((h) => httpCsp?.includes(h)) && !/unsafe-(inline|eval)/.test(httpCsp ?? ""), `${res.status} ${httpCsp}`);
  const asset = await fetch(`http://127.0.0.1:${port}/icon.svg`);
  check("CSP — HTML이 아닌 응답에는 안 단다", asset.status === 200 && !asset.headers.get("content-security-policy"));

  // 화면 전부 — 위반이 하나도 없어야 한다 (대시보드·라이브러리·상세는 위에서 이미 열었다)
  for (const p of ["/", "/settings", "/system", "/add", `/library/detail?entry=${entryId}`]) await goto(`app://starlog${p}`);
  // 상세의 스크린샷 썸네일 — 로컬 서버(127.0.0.1)에서 실제로 그려졌나
  const localImgs = await js(`[...document.images].filter((i) => i.src.startsWith("starlog-media://thumb/") && i.complete && i.naturalWidth > 0).length`);
  check("CSP — 상세의 스크린샷 썸네일(starlog-media://)이 그려진다", localImgs >= 1, `${localImgs}장`);
  await goto("app://starlog/dashboard");
  const webgl = await js("!!document.querySelector('canvas') && !!document.createElement('canvas').getContext('webgl')");
  const fonts = await js("document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))");
  check("CSP — 입구·대시보드·라이브러리·상세·설정·시스템·추가에서 위반 0 (WebGL 배경·글꼴 포함)",
    cspViolations.length === 0 && webgl && fonts.length >= 1, `${cspViolations.join(" | ")} webgl=${webgl} fonts=${fonts.join(",")}`);

  // 주입된 인라인 스크립트·이벤트 핸들러는 못 돈다
  const injected = await js(`(async () => {
    const seen = [];
    document.addEventListener("securitypolicyviolation", (e) => seen.push(e.violatedDirective));
    const s = document.createElement("script"); s.textContent = "window.__cspInline = 1"; document.head.append(s);
    const d = document.createElement("div"); d.innerHTML = '<img src="data:," onerror="window.__cspHandler = 1">'; document.body.append(d);
    const blocked = await fetch("https://example.invalid/x").then(() => "통과", () => "막힘");
    // 영상: 로컬 서버는 열려 있고(없는 파일이라 네트워크 오류일 뿐) 남의 주소는 정책이 막는다
    // 이미지: IGDB는 열려 있고 남의 주소는 막힌다 (없는 파일이라 IGDB는 404일 뿐)
    for (const src of ["https://images.igdb.com/igdb/image/upload/t_thumb/csp-e2e.jpg", "https://example.invalid/x.png"]) {
      const i = new Image(); i.src = src;
    }
    for (const src of ["http://127.0.0.1:${port}/none.mp4", "https://example.invalid/v.mp4"]) {
      const v = document.createElement("video"); v.muted = true; v.src = src; document.body.append(v); v.load(); setTimeout(() => v.remove(), 250);
    }
    await new Promise((r) => setTimeout(r, 300));
    d.remove();
    return { inline: window.__cspInline ?? null, handler: window.__cspHandler ?? null, blocked, seen };
  })()`);
  check("CSP — 주입한 <script>·onerror는 안 돌고, 허용 밖 출처로는 fetch가 막힌다",
    injected.inline === null && injected.handler === null && injected.blocked === "막힘"
      && injected.seen.some((d) => d.startsWith("script-src")) && injected.seen.some((d) => d.startsWith("connect-src")), JSON.stringify(injected));
  check("CSP — 영상은 로컬 서버만, 이미지는 IGDB까지 (남의 주소 각 1건만 위반)",
    injected.seen.filter((d) => d === "media-src").length === 1 && injected.seen.filter((d) => d === "img-src").length === 1, JSON.stringify(injected.seen));

  // 메모의 HTML은 react-markdown이 글자로 낸다 — 정책과 별개로 애초에 스크립트가 안 생긴다
  await api(port, "PUT", "/api/me/profile", { nickname: "e2e", memo: "메모<script>window.__memo = 1</script><img src=x onerror=\"window.__memo = 2\">" });
  await goto("app://starlog/settings");
  const memo = await js(`({ ran: window.__memo ?? null, scripts: [...document.querySelectorAll(".markdown script, .markdown img[onerror]")].length })`);
  check("마크다운 — 메모의 <script>·onerror는 요소가 안 된다", memo.ran === null && memo.scripts === 0, JSON.stringify(memo));
  cspViolations.length = 0;
}

/** 연결 설정을 저장한 뒤 받은 문서의 CSP에 그 스토리지 주소가 들어간다 (가짜 주소 — 붙지 않는다) */
async function cspStorageSteps() {
  await goto("app://starlog/");
  const p = await cspHeader();
  const imgSrc = /img-src ([^;]*)/.exec(p ?? "")?.[1] ?? "";
  const connectSrc = /connect-src ([^;]*)/.exec(p ?? "")?.[1] ?? "";
  check("CSP — 저장된 연결의 공개 주소는 img-src, 엔드포인트는 connect-src에 (출처만)",
    imgSrc.includes("https://203.0.113.3") && connectSrc.includes("https://203.0.113.2") && !connectSrc.includes("https://203.0.113.3"), p);
  const csp = require(path.join(ROOT, "desktop/csp.js"));
  check("CSP — 연결 주소에 섞인 ; 공백은 정책에 못 끼어든다",
    csp.originOf("https://a.example/x; script-src *") === "https://a.example" && csp.originOf("javascript:alert(1)") === null);
}

/** 데이터 루트·openPath·백업 이름 */
async function pathSteps(save) {
  const dirs = await js("window.starlog.settings.get().then((s) => s.dirs)");
  const outside = path.join(TMP, "elsewhere");
  const r1 = await js(`window.starlog.settings.setDataRoot(${JSON.stringify(outside)}).then(() => "통과", () => "거절")`);
  check("데이터 루트 — [폴더 고르기]로 안 고른 경로는 거절", r1 === "거절");

  const realDialog = realElectron.dialog.showOpenDialog;
  try {
    realElectron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [os.homedir()] });
    const home = await js("window.starlog.pickFolder()");
    const r2 = await js(`window.starlog.settings.setDataRoot(${JSON.stringify(home)}).then(() => "통과", (e) => "거절")`);
    check("데이터 루트 — 홈 폴더 자체는 골라도 거절", r2 === "거절");

    // 정상 경로는 고르면 된다 — 그리고 원래 자리로 되돌린다
    fs.mkdirSync(outside, { recursive: true });
    realElectron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [outside] });
    const picked = await js("window.starlog.pickFolder()");
    const r3 = await js(`window.starlog.settings.setDataRoot(${JSON.stringify(picked)}).then(() => "통과", (e) => String(e))`);
    realElectron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dirs.root] });
    await js("window.starlog.pickFolder()");
    const r4 = await js(`window.starlog.settings.setDataRoot(${JSON.stringify(dirs.root)}).then(() => "통과", (e) => String(e))`);
    check("데이터 루트 — 고른 폴더는 받고, 되돌리기도 된다", r3 === "통과" && r4 === "통과", `${r3} / ${r4}`);
  } finally {
    realElectron.dialog.showOpenDialog = realDialog;
  }

  const file = path.join(dirs.media, "note.command");
  fs.writeFileSync(file, "#!/bin/sh\necho pwned\n", { mode: 0o755 });
  const bundle = path.join(dirs.media, "evil.app");
  fs.mkdirSync(path.join(bundle, "Contents"), { recursive: true });
  const link = path.join(dirs.media, "escape");
  fs.symlinkSync(TMP, link);
  shellCalls.length = 0;
  const op = async (p) => js(`window.starlog.openPath(${JSON.stringify(p)}).then(() => "통과", () => "거절")`);
  const results = { file: await op(file), bundle: await op(bundle), link: await op(link), up: await op(path.join(dirs.root, "..")), dir: await op(dirs.media) };
  check("openPath — 파일·앱 묶음·밖을 가리키는 링크·바깥은 거절, 데이터 루트 안 폴더만",
    results.file === "거절" && results.bundle === "거절" && results.link === "거절" && results.up === "거절" && results.dir === "통과"
      && shellCalls.length === 1 && shellCalls[0][0] === "openPath", `${JSON.stringify(results)} ${JSON.stringify(shellCalls)}`);
  fs.rmSync(file);
  fs.rmSync(bundle, { recursive: true });
  fs.rmSync(link);

  const b1 = await js(`window.starlog.backups.remove(${JSON.stringify(save)}, "../../../escape.tar.gz").then(() => "통과", () => "거절")`);
  const b2 = await js(`window.starlog.backups.remove(${JSON.stringify(save)}, "settings.json").then(() => "통과", () => "거절")`);
  check("backups:remove — .tar.gz 파일 이름만", b1 === "거절" && b2 === "거절", `${b1} ${b2}`);
}

/** 연결 설정 — 화면에는 가린 값만, 디스크에는 잠근 값만. 실제 DB에는 안 붙는다(저장·목록만) */
async function connectionSteps() {
  const CONN = path.join(TMP, "appData/starlog/connections.json");
  const SECRETS = ["FAKE_DB_PASSWORD_123456", "FAKE_ACCESS_KEY_ABCDEFG", "FAKE_S3_SECRET_KEY_7890", "FAKE_IGDB_SECRET_00000", "FAKE_TRANSLATE_KEY_11111"];
  const profile = {
    name: "E2E 연결",
    db: { url: "jdbc:postgresql://203.0.113.1/x", user: "u", password: SECRETS[0], schema: "" },
    storage: { endpoint: "https://203.0.113.2", bucket: "b", accessKey: SECRETS[1], secretKey: SECRETS[2], publicBaseUrl: "https://203.0.113.3" },
    igdb: { clientId: "cid", clientSecret: SECRETS[3] },
    translate: { apiKey: SECRETS[4] },
    coverTarget: "db",
  };
  const saved = await js(`window.starlog.connections.save(${JSON.stringify(profile)})`);
  const listed = await js("window.starlog.connections.list()");
  const listText = JSON.stringify([saved, listed]);
  check("connections:list — 평문 비밀이 렌더러로 안 온다 (가린 값 + hasSecret)",
    SECRETS.every((x) => !listText.includes(x)) && listed[0]?.hasSecret?.["db.password"] === true && listed[0]?.db?.password === "••••3456",
    JSON.stringify(listed[0]?.db));
  const disk = fs.readFileSync(CONN, "utf8");
  check("connections.json — 디스크에 평문 비밀이 없다 (safeStorage로 sealed)", SECRETS.every((x) => !disk.includes(x)) && disk.includes("\"sealed\""), disk.slice(0, 160));
  check("connections.json — 0600", (fs.statSync(CONN).mode & 0o777) === 0o600);
  await cspStorageSteps();

  // 가린 값 그대로 저장 → 진짜 값 유지. 눈 버튼으로 칸 하나씩
  await js(`window.starlog.connections.list().then((l) => window.starlog.connections.save({ ...l[0], db: { ...l[0].db, user: "u2" } }, { previousName: l[0].name }))`);
  const revealed = await js(`Promise.all(${JSON.stringify(["db.password", "storage.accessKey", "storage.secretKey", "igdb.clientSecret", "translate.apiKey"])}.map((f) => window.starlog.connections.reveal("E2E 연결", f)))`);
  check("가린 값을 안 고치고 저장하면 진짜 값이 남는다 (reveal로 확인)", JSON.stringify(revealed) === JSON.stringify(SECRETS), JSON.stringify(revealed));
  // 이름 바꾸기 — 진짜 값은 옛 이름 쪽에서 푼다
  await js(`window.starlog.connections.list().then(async (l) => { await window.starlog.connections.save({ ...l[0], name: "E2E 연결2" }, { previousName: "E2E 연결" }); await window.starlog.connections.remove("E2E 연결"); })`);
  const renamed = await js(`window.starlog.connections.reveal("E2E 연결2", "db.password")`);
  check("이름을 바꿔도 가린 값이 진짜 값으로 이어진다 (previousName)", renamed === SECRETS[0], renamed);
  const forged = await js(`window.starlog.connections.reveal("E2E 연결2", "db.url").then(() => "통과", () => "거절")`);
  check("reveal — 비밀 칸이 아닌 이름은 거절", forged === "거절");

  // 이름 겹침 — 새 연결도, 이름 바꾸기도 남의 연결을 덮지 않는다. 짧은 비번(가린 모양이 같다)이 섞이지 않는다
  const short = { ...profile, name: "짧은 비번", db: { ...profile.db, password: "short1" }, storage: {}, igdb: {}, translate: {} };
  await js(`window.starlog.connections.save(${JSON.stringify(short)})`);
  const dupNew = await js(`window.starlog.connections.save(${JSON.stringify({ ...profile, name: "짧은 비번" })}).then(() => "통과", (e) => String(e))`);
  const dupRename = await js(`window.starlog.connections.list().then((l) => window.starlog.connections.save({ ...l.find((p) => p.name === "E2E 연결2"), name: "짧은 비번" }, { previousName: "E2E 연결2" })).then(() => "통과", (e) => String(e))`);
  const shortPw = await js(`window.starlog.connections.reveal("짧은 비번", "db.password")`);
  check("연결 이름 겹침 — 새 연결·이름 바꾸기 모두 거절, 남의 비번 그대로",
    /이미 있습니다/.test(dupNew) && /이미 있습니다/.test(dupRename) && shortPw === "short1", `${dupNew} / ${dupRename} / ${shortPw}`);
  // 이름 바꾸기는 제자리에서 — 옛 이름이 안 남고 [최근 접속]도 따라간다
  const SETTINGS = path.join(TMP, "appData/starlog/settings.json");
  const settingsBefore = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
  fs.writeFileSync(SETTINGS, JSON.stringify({ ...settingsBefore, lastMode: "cloud", lastTarget: "E2E 연결2" }));
  await js(`window.starlog.connections.list().then((l) => window.starlog.connections.save({ ...l.find((p) => p.name === "E2E 연결2"), name: "E2E 연결3" }, { previousName: "E2E 연결2" }))`);
  const names3 = (await js("window.starlog.connections.list()")).map((p) => p.name);
  const moved = JSON.parse(fs.readFileSync(SETTINGS, "utf8")).lastTarget;
  const pw3 = await js(`window.starlog.connections.reveal("E2E 연결3", "db.password")`);
  check("연결 이름 바꾸기 — 옛 항목 없이 제자리, 비번 유지, [최근 접속]도 새 이름",
    !names3.includes("E2E 연결2") && names3.includes("E2E 연결3") && pw3 === SECRETS[0] && moved === "E2E 연결3", `${names3.join(",")} / ${moved}`);
  await js(`window.starlog.connections.remove("E2E 연결3")`);
  check("연결 지우기 — [최근 접속]도 지운다", JSON.parse(fs.readFileSync(SETTINGS, "utf8")).lastTarget == null);
  fs.writeFileSync(SETTINGS, JSON.stringify({ ...JSON.parse(fs.readFileSync(SETTINGS, "utf8")), lastMode: settingsBefore.lastMode, lastTarget: settingsBefore.lastTarget }));

  // 옛 평문 파일 → 처음 읽을 때 잠가서 다시 쓴다. 못 푸는 봉투는 지우지 않고 locked
  fs.writeFileSync(CONN, JSON.stringify({ version: 1, profiles: [
    { name: "옛 평문", db: { url: "jdbc:postgresql://203.0.113.1/x", user: "u", password: "OLD_PLAINTEXT_PASSWORD_1" } },
    { name: "못 푸는 것", db: { url: "jdbc:postgresql://203.0.113.1/y", user: "u" }, sealed: "bm90LWEtcmVhbC1ibG9i" },
  ] }), { mode: 0o600 });
  const migrated = await js("window.starlog.connections.list()");
  const disk2 = fs.readFileSync(CONN, "utf8");
  const oldPw = await js(`window.starlog.connections.reveal("옛 평문", "db.password")`);
  check("옛 평문 connections.json은 읽자마자 잠가 다시 쓴다 (값은 그대로)",
    !disk2.includes("OLD_PLAINTEXT_PASSWORD_1") && oldPw === "OLD_PLAINTEXT_PASSWORD_1", disk2.slice(0, 200));
  const locked = migrated.find((p) => p.name === "못 푸는 것");
  check("못 푸는 연결은 locked로 남고 봉투는 보존된다", locked?.locked === true && disk2.includes("bm90LWEtcmVhbC1ibG9i"), JSON.stringify(locked));
  const launchLocked = await js(`window.starlog.launch({ mode: "cloud", target: "못 푸는 것" })`);
  check("locked 연결로 기동하면 CREDENTIALS_LOCKED (DB에 붙지 않는다)", launchLocked.ok === false && launchLocked.code === "CREDENTIALS_LOCKED", JSON.stringify(launchLocked));

  // 깨진 파일 — 지우지 않고 옆으로 비켜둔다
  fs.writeFileSync(CONN, "{ not json", { mode: 0o600 });
  const afterCorrupt = await js("window.starlog.connections.list()");
  const dir = path.dirname(CONN);
  const aside = fs.readdirSync(dir).filter((f) => f.startsWith("connections.json.corrupt-"));
  check("깨진 connections.json은 .corrupt-<시각>으로 보존 (덮어쓰지 않는다)",
    afterCorrupt.length === 0 && aside.length === 1 && fs.readFileSync(path.join(dir, aside[0]), "utf8") === "{ not json", aside.join(","));
}

/**
 * 커버 저장 위치 (2026-10-25) — 옛 체크박스(`mediaTargets`)를 읽을 때 옮기는지, 고른 값이 저장·검사되는지,
 * 서버 환경변수로 넘어가는지. 클라우드는 가짜 서버(crash)로 환경만 보고 내린다 — 진짜 DB에 안 붙는다
 */
async function coverTargetSteps() {
  const CONN = path.join(TMP, "appData/starlog/connections.json");
  const db = { url: "postgresql://203.0.113.1/x", user: "u" };
  fs.writeFileSync(CONN, JSON.stringify({ version: 2, profiles: [
    { name: "옛 체크 켬", db, mediaTargets: { covers: true, screenshots: true } },
    { name: "옛 체크 끔", db, mediaTargets: { covers: false, screenshots: true } },
    { name: "이상한 값", db, coverTarget: "s3" },
  ] }), { mode: 0o600 });
  const listed = await js("window.starlog.connections.list()");
  const of = (name) => listed.find((p) => p.name === name);
  check("커버 위치 — 옛 체크 켬은 storage, 끔은 db, 모르는 값은 db로 읽는다 (mediaTargets는 사라진다)",
    of("옛 체크 켬")?.coverTarget === "storage" && of("옛 체크 끔")?.coverTarget === "db" && of("이상한 값")?.coverTarget === "db"
      && listed.every((p) => !("mediaTargets" in p)), JSON.stringify(listed.map((p) => [p.name, p.coverTarget, p.mediaTargets])));
  const disk = JSON.parse(fs.readFileSync(CONN, "utf8"));
  check("커버 위치 — 읽으면서 디스크도 옮겨 쓴다 (스크린샷 체크도 함께 사라진다)",
    disk.profiles.every((p) => !("mediaTargets" in p)) && disk.profiles.map((p) => p.coverTarget).join(",") === "storage,db,db",
    JSON.stringify(disk.profiles.map((p) => [p.coverTarget, p.mediaTargets])));

  await js(`window.starlog.connections.save({ ...${JSON.stringify(of("옛 체크 끔"))}, coverTarget: "local" }, { previousName: "옛 체크 끔" })`);
  const bad = await js(`window.starlog.connections.save({ ...${JSON.stringify(of("옛 체크 켬"))}, coverTarget: "s3" }, { previousName: "옛 체크 켬" }).then(() => "통과", (e) => String(e))`);
  const after = await js("window.starlog.connections.list()");
  check("커버 위치 — 고른 값이 저장되고, 셋 밖의 값은 거절 (저장된 값 그대로)",
    after.find((p) => p.name === "옛 체크 끔")?.coverTarget === "local" && /커버 저장 위치/.test(bad)
      && after.find((p) => p.name === "옛 체크 켬")?.coverTarget === "storage", `${bad} ${JSON.stringify(after.map((p) => p.coverTarget))}`);

  // 클라우드 기동 — 가짜 서버가 받은 환경만 적고 죽는다
  fakeMode({ mode: "crash" });
  const seen = {};
  for (const name of ["옛 체크 켬", "옛 체크 끔"]) {
    const mark = spawnLog().length;
    await js(`window.starlog.launch({ mode: "cloud", target: ${JSON.stringify(name)} })`);
    seen[name] = spawnLog().slice(mark).map((l) => [l.coverTarget, l.legacyMedia.length]);
  }
  fakeMode({});
  check("커버 위치 — 클라우드 기동에 STARLOG_COVER_TARGET으로 넘긴다 (옛 STARLOG_MEDIA_USE_STORAGE_* 없음)",
    seen["옛 체크 켬"].length > 0 && seen["옛 체크 켬"].every(([t, n]) => t === "storage" && n === 0)
      && seen["옛 체크 끔"].length > 0 && seen["옛 체크 끔"].every(([t, n]) => t === "local" && n === 0), JSON.stringify(seen));
  for (const p of after) await js(`window.starlog.connections.remove(${JSON.stringify(p.name)})`);

  // 로컬 세이브 — settings.json 하나. 셋째(스토리지)는 없다
  const SAVE = "E2E 커버";
  await js(`window.starlog.saves.create(${JSON.stringify(SAVE)})`);
  const before = await js("window.starlog.settings.get()");
  const rejected = await js(`window.starlog.settings.setLocalCoverTarget("storage").then(() => "통과", () => "거절")`);
  await js(`window.starlog.settings.setLocalCoverTarget("local")`);
  const mark = spawnLog().length;
  const up = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(SAVE)} })`);
  const env = spawnLog().slice(mark).map((l) => l.coverTarget);
  let prep = null;
  if (up.ok) {
    const g = await api(up.port, "POST", "/api/games", { name: "E2E 커버 게임" });
    const e = await api(up.port, "POST", "/api/backlog", { gameId: g.json?.id });
    prep = await api(up.port, "POST", `/api/backlog/${e.json?.id}/cover/upload-url`, { fileName: "a.png", sizeBytes: 10 });
  }
  await js(`window.starlog.settings.setLocalCoverTarget("db")`);
  check("로컬 커버 위치 — 기본 db, storage는 거절, local을 고르면 다음 기동에 넘긴다",
    before.localCoverTarget === "db" && rejected === "거절" && env.at(-1) === "local" && prep?.json?.mode === "LOCAL"
      && (await js("window.starlog.settings.get()")).localCoverTarget === "db",
    `${before.localCoverTarget} ${rejected} ${env.join(",")} ${prep?.status} ${prep?.json?.mode}`);
  await goto("app://starlog/");
}

/**
 * DB 커버 (V17) — 기본 위치로 올리고, 바이트·머리글을 보고, 교체하면 주소(`?v=`)가 바뀌는지.
 * 세이브 백업(.tar.gz)·클라우드 백업(.json.gz)에 따라가는지는 그 단계들이 `coverBytes`로 다시 본다
 */
let coverBytes = null;
async function coverDbSteps(port, entryId) {
  const samples = path.join(TMP, "samples");
  const prep = await api(port, "POST", `/api/backlog/${entryId}/cover/upload-url`, { fileName: "square.png", sizeBytes: 10 });
  check("DB 커버 — 로컬 세이브 기본은 DB (mode)", prep.json?.mode === "DB", JSON.stringify(prep.json));
  const send = async (file) => {
    const fd = new FormData();
    fd.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));
    return (await fetch(`http://127.0.0.1:${port}/api/backlog/${entryId}/cover/file`, { method: "POST", body: fd, headers: await auth() })).status;
  };
  const urlOf = async () => (await api(port, "GET", `/api/backlog/${entryId}`)).json?.resolved?.cover?.url ?? null;
  const s1 = await send(path.join(samples, "square.png"));
  const url1 = await urlOf();
  const s2 = await send(path.join(samples, "port.jpg"));
  const url2 = await urlOf();
  const res = await fetch(`http://127.0.0.1:${port}${url2}`, { headers: await auth() });
  const got = Buffer.from(await res.arrayBuffer());
  const want = fs.readFileSync(path.join(samples, "port.jpg"));
  check("DB 커버 — 올리고 교체하면 ?v=가 바뀌고, 바이트·타입·캐시 머리글이 맞다",
    s1 === 200 && s2 === 200 && url1 && url2 && url1 !== url2 && /\/cover\/file\?v=[0-9a-f-]{36}\.jpg$/.test(url2)
      && got.equals(want) && res.headers.get("content-type") === "image/jpeg" && /immutable/.test(res.headers.get("cache-control") ?? ""),
    `${s1} ${s2} ${url1} → ${url2} ${got.length}/${want.length} ${res.headers.get("content-type")} ${res.headers.get("cache-control")}`);
  const files = fs.readdirSync(path.join(TMP, "appData/starlog/data/covers"));
  check("DB 커버 — 데이터 폴더 covers/에 파일을 안 만든다", files.length === 0, files.join(","));
  coverBytes = want;
  coverUrlBefore = url2;
}

/**
 * 화면의 커버 올리기 — 올리기 전에 긴 변 1200px · JPEG로 줄이는지 (`lib/upload.ts` `shrinkCover`).
 * 진짜 상세 화면의 [커버 이미지 변경] 팝업에 파일 칸으로 2560×1440 PNG를 넣는다 (CDP `DOM.setFileInputFiles`)
 */
async function coverResizeSteps(port, entryId) {
  const { nativeImage } = realElectron;
  const big = path.join(TMP, "samples", "land.png");
  await goto(`app://starlog/library/detail?entry=${entryId}`);
  await js(`document.querySelector('button[aria-label="커버 이미지 변경"]')?.click(); 0`);
  await sleep(500);
  const dbg = win.webContents.debugger;
  dbg.attach("1.3");
  try {
    const { root } = await dbg.sendCommand("DOM.getDocument", { depth: -1 });
    const { nodeId } = await dbg.sendCommand("DOM.querySelector", { nodeId: root.nodeId, selector: '[aria-modal="true"] input[type=file]' });
    if (nodeId) await dbg.sendCommand("DOM.setFileInputFiles", { nodeId, files: [big] });
  } finally {
    dbg.detach();
  }
  let url = null;
  for (let i = 0; i < 50; i += 1) {
    await sleep(200);
    url = (await api(port, "GET", `/api/backlog/${entryId}`)).json?.resolved?.cover?.url ?? null;
    if (url && url !== coverUrlBefore) break;
  }
  const res = url ? await fetch(`http://127.0.0.1:${port}${url}`, { headers: await auth() }) : null;
  const got = res ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
  const size = got.length ? nativeImage.createFromBuffer(got).getSize() : { width: 0, height: 0 };
  const origin = fs.statSync(big).size;
  check("커버 올리기(화면) — 2560×1440 PNG를 긴 변 1200 JPEG로 줄여 올린다",
    url !== coverUrlBefore && size.width === 1200 && size.height === 675 && got[0] === 0xff && got[1] === 0xd8,
    `${url} ${size.width}x${size.height} ${(got.length / 1024).toFixed(0)}KB ← ${(origin / 1024).toFixed(0)}KB`);
  if (got.length) coverBytes = got;
  await goto("app://starlog/dashboard");
}
let coverUrlBefore = null;

/** 그 세이브의 그 항목 커버가 `coverBytes`와 같은가 */
async function sameCover(port, name) {
  const cards = await api(port, "GET", "/api/backlog/cards");
  const card = cards.json?.find?.((c) => c.displayName === name) ?? (cards.json?.items ?? []).find((c) => c.displayName === name);
  if (!card?.coverUrl) return `커버 주소 없음 ${JSON.stringify(card)?.slice(0, 120)}`;
  const res = await fetch(`http://127.0.0.1:${port}${card.coverUrl}`, { headers: await auth() });
  const got = Buffer.from(await res.arrayBuffer());
  return res.status === 200 && coverBytes && got.equals(coverBytes) ? true : `${res.status} ${got.length}B`;
}

/** 그 pid가 아직 살아 있나 — 우리가 띄운 서버만 본다 */
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function gone(pid, ms = 4000) {
  for (let t = 0; t < ms; t += 100) { if (!pidAlive(pid)) return true; await sleep(100); }
  return !pidAlive(pid);
}
const lastSpawn = () => spawnLog().at(-1);

/**
 * 흐름이 막히거나 거짓말하던 것들 (코드 리뷰 2026-10-25) — 기동 타임아웃·취소·겹친 기동·앱 안 죽음·
 * 연결 테스트 판정·[최근 접속]·자동 백업·반쪽 세이브·이름 규칙
 */
async function robustnessSteps(save, other) {
  const savesDir = path.join(TMP, "appData/starlog/data/saves");
  const dirs = { saves: savesDir, backups: path.join(TMP, "appData/starlog/data/backups") };
  const saveFiles = require(path.join(ROOT, "desktop/saveFiles.js"));

  // ── 이름 규칙: 점으로 시작하는 이름은 만들기부터 거절 (예전엔 만들기는 되고 열기에서 던졌다)
  const dot = await js(`window.starlog.saves.create(".abc").then(() => "통과", () => "거절")`);
  check("세이브 이름 — 점으로 시작하면 만들 때 거절", dot === "거절");

  // ── 자동 백업은 내용이 바뀌었을 때만 — 열고 닫기만 하면 늘지 않는다
  const count = async () => (await js(`window.starlog.backups.usage(${JSON.stringify(save)})`)).count;
  await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(other)} })`);   // 한 번 닫아 둔다
  const before = await count();
  for (let i = 0; i < 3; i += 1) {
    await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} })`);
    await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(other)} })`);
  }
  const after = await count();
  check("자동 백업 — 읽기만 한 기동 세 번에 백업이 쌓이지 않는다 (힌트 비트로 많아야 1장)", after - before <= 1, `${before} → ${after}`);

  // ── 겹친 기동: 늦은 쪽이 이기고, 앞엣것은 조용히 SUPERSEDED. ready 뒤에 오류가 날아오지 않는다
  await js(`window.__prog = []; window.__unsub = window.starlog.onProgress((p) => window.__prog.push(p.phase + ":" + (p.code ?? "") + ":" + (p.target ?? ""))); 0`);
  const both = await js(`Promise.all([
    window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} }),
    window.starlog.launch({ mode: "local", target: ${JSON.stringify(other)} }),
  ])`);
  await sleep(1500);
  const prog = await js("window.__prog");
  check("겹친 기동 — 앞엣것은 SUPERSEDED, 뒤엣것은 성공, 오류 이벤트 없음",
    both[0].code === "SUPERSEDED" && both[1].ok === true && !prog.some((p) => p.startsWith("error")), `${JSON.stringify(both)} ${prog.join(" ")}`);

  // ── 앱 안에서 서버가 혼자 죽으면 입구로 오면서 이유를 띄운다 (예전엔 이벤트를 받을 화면이 없어 이유가 사라졌다)
  await goto("app://starlog/dashboard");
  const pid = Number(fs.readFileSync(path.join(savesDir, `${other}.lock`), "utf8"));
  process.kill(pid, "SIGKILL");
  await gone(pid);
  // 강제로 죽인 서버의 잠금이 남는다 — 다음 서버가 죽은 pid의 잠금은 넘겨받지만, 끝의 "잠금 없음" 검사를 위해 치운다
  fs.rmSync(path.join(savesDir, `${other}.lock`), { force: true });
  await sleep(2000);
  const shown = await js("({ url: location.pathname, text: document.body.innerText })");
  const again = await js("window.starlog.takeLaunchError()");
  check("앱 안에서 서버가 죽으면 — 입구로 와서 이유를 띄우고, 이유는 한 번만 쓰인다",
    shown.url === "/" && shown.text.includes("앱 서버가 예기치 않게 종료됐습니다") && again === null,
    `${shown.url} ${shown.text.slice(0, 120).replace(/\n/g, " ")}`);
  await goto("app://starlog/");

  // ── 90초(여기선 8초) 안에 안 뜨면 내리고 TIMEOUT으로 돌아온다
  fakeMode({ mode: "hang" });
  let t = Date.now();
  const timedOut = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} })`);
  const hungPid = lastSpawn()?.pid;
  check("기동 타임아웃 — 영원히 기다리지 않고 TIMEOUT, 띄우던 서버는 내린다",
    timedOut.ok === false && timedOut.code === "TIMEOUT" && Date.now() - t < 15_000 && await gone(hungPid),
    `${JSON.stringify(timedOut)} ${Date.now() - t}ms`);
  const afterTimeout = await js("window.starlog.session.current()");
  check("기동 타임아웃 — 살아 있는 세션으로 남지 않는다", !afterTimeout?.alive, JSON.stringify(afterTimeout));

  // ── 기다리다 [취소]
  t = Date.now();
  // 끝에 `0` — 식의 값이 약속이면 executeJavaScript가 그걸 기다린다
  await js(`window.__launch = window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} }); 0`);
  await sleep(800);
  await js("window.starlog.cancelLaunch()");
  const canceled = await js("window.__launch");
  const cancelPid = lastSpawn()?.pid;
  check("기동 [취소] — 곧바로 SUPERSEDED, 띄우던 서버는 내린다",
    canceled.code === "SUPERSEDED" && Date.now() - t < 5000 && await gone(cancelPid), `${JSON.stringify(canceled)} ${Date.now() - t}ms`);

  // ── 연결 테스트: 진단 없이 죽으면 실패, DB는 점검 전용으로만 띄운다
  const probeProfile = { name: "시험 대상", db: { url: "postgresql://203.0.113.9/none", user: "u", password: "p" } };
  fakeMode({ mode: "crash" });
  const crashed = await js(`window.starlog.connections.test(${JSON.stringify(probeProfile)}, { scope: "db" })`);
  check("연결 테스트 — 서버가 진단 없이 죽으면 성공이 아니라 BACKEND_DIED",
    crashed.ok === false && crashed.database?.ok === false && crashed.code === "BACKEND_DIED", JSON.stringify(crashed));
  fakeMode({ fakeCheck: true });
  const mark = spawnLog().length;
  const checked = await js(`window.starlog.connections.test(${JSON.stringify(probeProfile)}, { scope: "all" })`);
  const spawned = spawnLog().slice(mark);
  check("연결 테스트 — DB는 점검 전용(STARLOG_CHECK_ONLY)으로만 띄운다 (키가 없으면 다른 시험용도 안 띄운다)",
    checked.ok === true && checked.database?.ok === true && spawned.length === 1 && spawned[0].checkOnly === "true" && spawned[0].dbUrl,
    `${JSON.stringify(checked)} ${JSON.stringify(spawned)}`);
  fakeMode({});

  // ── [최근 접속]은 있는 것만: 지운 세이브를 누르면 빈 세이브를 만들지 않는다
  const GONE = "지울 세이브";
  await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(GONE)} })`);
  await js(`window.starlog.saves.remove(${JSON.stringify(GONE)})`);
  const missing = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(GONE)}, resume: true })`);
  check("[최근 접속] — 지운 세이브는 SAVE_MISSING, 같은 이름의 빈 세이브가 안 생긴다",
    missing.code === "SAVE_MISSING" && !fs.existsSync(path.join(savesDir, GONE)), JSON.stringify(missing));
  const SETTINGS = path.join(TMP, "appData/starlog/settings.json");
  fs.writeFileSync(SETTINGS, JSON.stringify({ ...JSON.parse(fs.readFileSync(SETTINGS, "utf8")), lastMode: "cloud", lastTarget: "없는 연결" }));
  check("[최근 접속] — 없는 연결을 가리키면 버튼을 안 그린다 (session.current null)", (await js("window.starlog.session.current()")) === null);
  fs.writeFileSync(SETTINGS, JSON.stringify({ ...JSON.parse(fs.readFileSync(SETTINGS, "utf8")), lastMode: null, lastTarget: null }));

  // ── 붓다 만 세이브(.partial)는 목록에 안 뜨고, 기동 때 치워진다
  const HALF = "반쪽 세이브";
  fs.mkdirSync(path.join(savesDir, HALF), { recursive: true });
  fs.writeFileSync(path.join(savesDir, HALF, "PG_VERSION"), "17");
  fs.writeFileSync(path.join(savesDir, `${HALF}.partial`), "1");
  const listed = (await js("window.starlog.saves.list()")).map((x) => x.name);
  const removed = saveFiles.cleanPartials(dirs);
  check("반쪽 세이브 — 목록에 안 뜨고 정리되면 폴더째 사라진다",
    !listed.includes(HALF) && removed.includes(HALF) && !fs.existsSync(path.join(savesDir, HALF)) && !fs.existsSync(path.join(savesDir, `${HALF}.partial`)),
    `${listed.join(",")} / ${removed.join(",")}`);
}

// ── 클라우드 백업 (2026-10-25) — 진짜 Neon 없이 로컬 세션으로 같은 길을 밟는다 (`STARLOG_E2E_CLOUD_BACKUP_LOCAL`) ──
async function cloudBackupSteps(save) {
  const zlib = require("zlib");
  const cloudBackup = require(path.join(ROOT, "desktop/cloudBackup.js"));
  const dataRoot = path.join(TMP, "appData/starlog/data");
  const dirs = { root: dataRoot };
  const autoDir = path.join(dataRoot, "cloud-backups", save, "auto");
  const manualDir = path.join(dataRoot, "cloud-backups", save, "manual");
  const p2 = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const today = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
  const autos = () => (fs.existsSync(autoDir) ? fs.readdirSync(autoDir).sort() : []);
  const status = () => js("window.starlog.cloudBackups.status()");
  /** 자동 백업은 뒤에서 돈다 — seq가 앞으로 가고 끝난 상태가 될 때까지 */
  const waitAuto = async (afterSeq) => {
    for (let i = 0; i < 100; i += 1) {
      const s = (await status()).auto;
      if (s && s.seq > afterSeq && s.phase !== "running") return s;
      await sleep(200);
    }
    return null;
  };

  let restoredName = null;
  process.env.STARLOG_E2E_CLOUD_BACKUP_LOCAL = "1";
  try {
    // ① 서버가 뜨면 오늘 것이 없으니 한 장 — 화면은 기다리지 않는다
    let seq = (await status()).auto?.seq ?? 0;
    await goto("app://starlog/");
    const up = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} })`);
    const first = await waitAuto(seq);
    check("클라우드 자동 백업 — 기동 뒤 한 장", up.ok && first?.phase === "done" && autos().length === 1
      && autos()[0].startsWith(`auto-${today}`), `${first?.phase} ${first?.message ?? ""} ${autos().join(",")}`);
    const file = path.join(autoDir, autos()[0] ?? "x");
    const text = fs.existsSync(file) ? zlib.gunzipSync(fs.readFileSync(file)).toString("utf8") : "";
    const dump = text ? JSON.parse(text) : null;
    check("클라우드 백업 — 내보내기 JSON(gzip), 게임이 들어 있다", Boolean(dump?.formatVersion) && text.includes("E2E 테스트 게임"));
    check("클라우드 백업 — 자격증명 칸이 없다", !/password|secretKey|accessKey|clientSecret|apiKey/i.test(text));
    const dumped = dump?.entries?.find((e) => e.cover)?.cover;
    check("클라우드 백업 — 형식 6, DB 커버가 바이트(base64)째 실린다",
      dump?.formatVersion === 6 && dumped?.location === "DB" && coverBytes !== null && Buffer.from(dumped.data ?? "", "base64").equals(coverBytes),
      `${dump?.formatVersion} ${dumped?.location} ${dumped?.sizeBytes}`);
    check("클라우드 백업 — 파일 0600 · 폴더 0700", fs.existsSync(file) && (fs.statSync(file).mode & 0o777) === 0o600
      && (fs.statSync(autoDir).mode & 0o777) === 0o700);

    // 알림 — 본 앱 껍데기가 붙을 때 메인의 마지막 상태를 가져온다 (이벤트는 입구에서 쏘였다)
    await goto("app://starlog/dashboard");
    const toast = await js("document.body.innerText");
    check("클라우드 백업 알림 — 붙기 전에 끝난 것도 뜬다", toast.includes("클라우드 백업 완료") && toast.includes("자동 백업 1/10"),
      toast.split("\n").filter((l) => l.includes("백업")).join(" | "));

    // ② 같은 날 다시 열면 건너뛴다
    seq = (await status()).auto.seq;
    await goto("app://starlog/");
    await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} })`);
    const second = await waitAuto(seq);
    check("클라우드 자동 백업 — 오늘 것이 있으면 건너뛴다", second?.phase === "skipped" && autos().length === 1, `${second?.phase} ${autos().length}`);

    // ③ 수동 — 추천 이름 · 겹치면 -2 · 규칙 밖 거절
    const suggested = await js("window.starlog.cloudBackups.suggestName()");
    check("수동 백업 — 추천 이름 `<연결> 날짜 시.분`", new RegExp(`^${save} ${today} \\d{2}\\.\\d{2}$`).test(suggested), suggested);
    const made = await js(`window.starlog.cloudBackups.create(${JSON.stringify(suggested)})`);
    check("수동 백업 — manual/ 에 한 장", made.phase === "done" && fs.existsSync(path.join(manualDir, `${suggested}.json.gz`)), made.fileName);
    const next = await js("window.starlog.cloudBackups.suggestName()");
    check("수동 백업 — 같은 이름이 있으면 -2를 추천", next === `${suggested}-2`, next);
    const dup = await js(`window.starlog.cloudBackups.create(${JSON.stringify(suggested)}).then(() => "통과", () => "거절")`);
    const bad = await js(`window.starlog.cloudBackups.create("../../밖").then(() => "통과", () => "거절")`);
    check("수동 백업 — 같은 이름·경로 조각은 거절", dup === "거절" && bad === "거절", `${dup} ${bad}`);
    // 사람이 auto- 로 지어도 수동 폴더라 10개 규칙에 안 걸린다
    await js(`window.starlog.cloudBackups.create("auto-2000-01-01_000000")`);

    // ④ 10개 규칙 — 옛 자동 10장을 깔고 오늘 것을 지운 뒤 다시 열면 11 → 가장 오래된 것부터 지워 10
    const body = fs.readFileSync(file);
    for (let d = 1; d <= 10; d += 1) fs.writeFileSync(path.join(autoDir, `auto-2026-01-${p2(d)}_000000.json.gz`), body);
    fs.rmSync(file);
    seq = (await status()).auto.seq;
    await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} })`);
    const third = await waitAuto(seq);
    const left = autos();
    check("클라우드 자동 백업 — 10개만 남기고 가장 오래된 것부터 지운다",
      third?.phase === "done" && third.autoCount === 10 && left.length === 10 && !left.includes("auto-2026-01-01_000000.json.gz")
      && left.includes("auto-2026-01-02_000000.json.gz") && left.some((f) => f.startsWith(`auto-${today}`)), left.join(","));
    const manualLeft = fs.readdirSync(manualDir).sort();
    check("클라우드 자동 백업 — 수동 백업은 안 건드린다", manualLeft.length === 2, manualLeft.join(","));

    const listed = await js("window.starlog.cloudBackups.list()");
    check("클라우드 백업 목록 — 자동 10 + 수동 2, 종류별 폴더",
      listed.items.length === 12 && listed.autoCount === 10 && listed.items.filter((i) => i.kind === "manual").length === 2
      && listed.folders.auto === autoDir && listed.folders.manual === manualDir, `${listed.items.length} ${listed.autoCount}`);

    // ⑤ 지우기 — 수동만. 자동·경로 조각은 거절
    const rmAuto = await js(`window.starlog.cloudBackups.remove("auto", ${JSON.stringify(left[0])}).then(() => "통과", () => "거절")`);
    const rmEsc = await js(`window.starlog.cloudBackups.remove("manual", "../auto/${left[0]}").then(() => "통과", () => "거절")`);
    const rmKind = await js(`window.starlog.cloudBackups.remove("../x", "a.json.gz").then(() => "통과", () => "거절")`);
    await js(`window.starlog.cloudBackups.remove("manual", "auto-2000-01-01_000000.json.gz")`);
    check("클라우드 백업 지우기 — 수동만, 자동·경로 조각·모르는 종류는 거절",
      rmAuto === "거절" && rmEsc === "거절" && rmKind === "거절" && autos().length === 10
      && !fs.existsSync(path.join(manualDir, "auto-2000-01-01_000000.json.gz")), `${rmAuto} ${rmEsc} ${rmKind}`);

    // ⑥ 폴더 열기 — 종류의 폴더를 메인이 정한다
    shellCalls.length = 0;
    await js(`window.starlog.cloudBackups.openFolder("manual")`);
    check("클라우드 백업 — 수동 폴더 열기", shellCalls.some(([k, p]) => k === "openPath" && p === manualDir), JSON.stringify(shellCalls));

    // ⑦ 새 로컬 세이브로 풀기 — 있는 이름은 거절, 경로 조각 거절, 자동 폴더에 수동 이름 거절
    const taken = await js(`window.starlog.cloudBackups.restore("manual", ${JSON.stringify(`${suggested}.json.gz`)}, ${JSON.stringify(save)}).then(() => "통과", () => "거절")`);
    const esc = await js(`window.starlog.cloudBackups.restore("manual", "../../../saves/x.json.gz").then(() => "통과", () => "거절")`);
    const wrongKind = await js(`window.starlog.cloudBackups.restore("auto", ${JSON.stringify(`${suggested}.json.gz`)}).then(() => "통과", () => "거절")`);
    check("클라우드 백업 풀기 — 있는 세이브 이름·경로 조각·종류 어긋남은 거절", taken === "거절" && esc === "거절" && wrongKind === "거절",
      `${taken} ${esc} ${wrongKind}`);
    const restored = await js(`window.starlog.cloudBackups.restore("manual", ${JSON.stringify(`${suggested}.json.gz`)})`);
    const saves = (await js("window.starlog.saves.list()")).map((x) => x.name);
    check("클라우드 백업 풀기 — 새 세이브가 생긴다", saves.includes(restored.saveName), restored.saveName);
    restoredName = restored.saveName;

    // ⑧ 쓰다 만 .partial — 목록에 안 뜨고 기동 정리가 치운다
    const half = path.join(autoDir, `auto-${today}_235959.json.gz.partial`);
    fs.writeFileSync(half, "half");
    const listed2 = await js("window.starlog.cloudBackups.list()");
    const removed = cloudBackup.cleanPartials(dirs);
    check("클라우드 백업 — 쓰다 만 .partial은 목록에 없고 정리된다",
      listed2.items.length === 11 && removed.length === 1 && !fs.existsSync(half), `${listed2.items.length} ${removed.join(",")}`);
    const staging = path.join(dataRoot, "cloud-backups", ".staging");
    check("클라우드 백업 — 흘려 받은 임시 파일이 안 남는다 (.staging 비어 있음)",
      !fs.existsSync(staging) || fs.readdirSync(staging).length === 0, fs.existsSync(staging) ? fs.readdirSync(staging).join(",") : "없음");

    // ⑨ [최근 접속] 즉시 복귀도 "열 때"다 — 오늘 것을 지우고 입구 → resume
    const todayFile = () => autos().find((f) => f.startsWith(`auto-${today}`));
    if (todayFile()) fs.rmSync(path.join(autoDir, todayFile()));
    await goto("app://starlog/");
    seq = (await status()).auto.seq;
    const resumed = await js("window.starlog.session.resume()");
    const fourth = await waitAuto(seq);
    check("클라우드 자동 백업 — 즉시 복귀(session:resume)에서도 하루 한 번", Boolean(resumed?.port) && fourth?.phase === "done"
      && Boolean(todayFile()) && autos().length === 10, `${fourth?.phase} ${fourth?.message ?? ""} ${autos().length}`);

    // ⑩ 세션이 살아 있는 동안 주기적으로 — E2E는 간격을 줄인다. 오늘 것을 지우면 다음 차례에 한 장
    process.env.STARLOG_E2E_CLOUD_BACKUP_EVERY_MS = "400";
    await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(save)} })`);
    await sleep(300);
    if (todayFile()) fs.rmSync(path.join(autoDir, todayFile()));
    seq = (await status()).auto.seq;
    let tick = null;
    for (let i = 0; i < 40 && !(tick?.phase === "done" && tick.seq > seq); i += 1) {
      await sleep(200);
      tick = (await status()).auto;
    }
    check("클라우드 자동 백업 — 세션 중 주기 확인이 날이 바뀐(오늘 것 없는) 걸 잡는다",
      tick?.phase === "done" && tick.seq > seq && Boolean(todayFile()), `${tick?.phase} ${tick?.seq}/${seq}`);
  } finally {
    process.env.STARLOG_E2E_CLOUD_BACKUP_LOCAL = "";
    process.env.STARLOG_E2E_CLOUD_BACKUP_EVERY_MS = "";
  }

  // 푼 세이브를 열면 데이터가 있다 (끈 뒤라 자동 백업이 안 돈다)
  const opened = restoredName ? await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(restoredName)} })`) : null;
  const cards = opened?.ok ? await api(opened.port, "GET", "/api/backlog/cards") : null;
  check("클라우드 백업에서 푼 세이브에 데이터가 있다", JSON.stringify(cards?.json ?? "").includes("E2E 테스트 게임"), restoredName ?? "없음");
  const sameCloud = opened?.ok ? await sameCover(opened.port, "E2E 테스트 게임") : "기동 실패";
  check("클라우드 백업에서 푼 세이브에 DB 커버가 바이트째 있다", sameCloud === true, String(sameCloud));
  // 다른 세션으로 갈아탔다 — 앞 세션의 주기 확인이 남아 돌면 안 된다
  const quietFrom = (await js("window.starlog.cloudBackups.status()")).auto?.seq ?? 0;
  await sleep(1200);
  const quietTo = (await js("window.starlog.cloudBackups.status()")).auto?.seq ?? 0;
  check("클라우드 자동 백업 — 세션이 바뀌면 주기 확인이 멈춘다", quietFrom === quietTo, `${quietFrom} → ${quietTo}`);
}

/**
 * 클라우드 백업 폴더 = 연결 이름 (리뷰 2026-10-25). 대소문자 겹침 · 이름 바꾸기 충돌 · 지운 연결의 백업 ·
 * 받는 중 파일이 연결 폴더 밖에 있는지 · 가벼운 응답 검사. 진짜 클라우드 세션 없이 연결 IPC와 모듈로 본다
 */
async function cloudBackupFolderSteps() {
  const cloudBackup = require(path.join(ROOT, "desktop/cloudBackup.js"));
  const { Readable } = require("stream");
  const dataRoot = path.join(TMP, "appData/starlog/data");
  const dirs = { root: dataRoot };
  const root = path.join(dataRoot, "cloud-backups");
  const conn = (name) => ({ name, db: { url: "jdbc:postgresql://203.0.113.1/z", user: "u", password: "FAKE_PW_FOLDER_1" }, storage: {}, igdb: {}, translate: {} });
  const save = (profile, previousName) => js(`window.starlog.connections.save(${JSON.stringify(profile)}${previousName ? `, { previousName: ${JSON.stringify(previousName)} }` : ""}).then(() => "통과", (e) => String(e))`);
  const plant = (folder, file) => {
    fs.mkdirSync(path.join(root, folder, "manual"), { recursive: true });
    fs.writeFileSync(path.join(root, folder, "manual", file), "x");
  };
  const entries = () => (fs.existsSync(root) ? fs.readdirSync(root) : []);

  // ① 대소문자만 다른 이름 — 새로도, 바꿔서도 못 만든다
  await save(conn("CaseA"));
  const dupNew = await save(conn("casea"));
  await save(conn("다른 연결"));
  const dupRename = await save(conn("CASEA"), "다른 연결");
  check("연결 이름 — 대소문자만 달라도 겹침 (새 연결·이름 바꾸기)", /이미 있습니다/.test(dupNew) && /이미 있습니다/.test(dupRename), `${dupNew} / ${dupRename}`);

  // ② 대소문자만 바꾸는 이름 바꾸기 — 자기 자신과 겹친 게 아니다. 폴더도 따라간다(맥에서는 한 폴더)
  plant("CaseA", "a.json.gz");
  const caseOnly = await save(conn("casea"), "CaseA");
  check("연결 이름 대소문자만 바꾸기 — 허용, 백업 폴더 이름도 바뀐다",
    caseOnly === "통과" && entries().includes("casea") && !entries().includes("CaseA") && fs.existsSync(path.join(root, "casea/manual/a.json.gz")),
    `${caseOnly} ${entries().join(",")}`);

  // ③ 새 이름 자리에 주인 없는 폴더 — 비켜 두고 옮긴다 (섞지도, 옛 폴더에 버려두지도 않는다)
  plant("새 이름", "orphan.json.gz");
  await save(conn("새 이름"), "casea");
  const aside = entries().filter((e) => e.startsWith(".removed-새 이름-"));
  check("연결 이름 바꾸기 — 새 이름 폴더가 이미 있으면 그쪽을 .removed-로 비켜 두고 옮긴다",
    fs.existsSync(path.join(root, "새 이름/manual/a.json.gz")) && !fs.existsSync(path.join(root, "새 이름/manual/orphan.json.gz"))
    && aside.length === 1 && fs.existsSync(path.join(root, aside[0], "manual/orphan.json.gz")) && !entries().includes("casea"),
    entries().join(","));

  // ④ 연결 지우기 — 백업 폴더를 비켜 둔다. 같은 이름으로 새로 만들어도 물려받지 않는다
  await js(`window.starlog.connections.remove("새 이름")`);
  const retired = entries().filter((e) => e.startsWith(".removed-새 이름-"));
  await save(conn("새 이름"));
  check("연결 지우기 — 백업 폴더는 .removed-로 (지우지 않음), 같은 이름 새 연결은 빈손",
    retired.length === 2 && !entries().includes("새 이름") && retired.some((e) => fs.existsSync(path.join(root, e, "manual/a.json.gz"))),
    entries().join(","));

  // ⑤ 새 연결 이름 자리의 주인 없는 폴더도 물려받지 않는다
  plant("고아", "z.json.gz");
  await save(conn("고아"));
  check("새 연결 — 그 이름의 주인 없는 백업 폴더는 비켜 둔다", !entries().includes("고아") && entries().some((e) => e.startsWith(".removed-고아-")), entries().join(","));

  // ⑥ 예전에 만든 대소문자 쌍은 폴더를 갈라 놓는다 (해시)
  const a = cloudBackup.folderName("Neon", ["neon"]);
  const b = cloudBackup.folderName("neon", ["Neon"]);
  check("백업 폴더 — 옛 대소문자 쌍은 서로 다른 폴더, 혼자면 이름 그대로",
    a !== b && a.toLowerCase() !== b.toLowerCase() && cloudBackup.folderName("Neon", ["다른"]) === "Neon", `${a} / ${b}`);

  // ⑦ 받는 중 파일은 연결 폴더 밖(.staging)에 — 받는 사이 이름이 바뀌어도 옛 폴더가 다시 안 생긴다
  const tmp = cloudBackup.stage(dirs);
  await cloudBackup.gzipInto(tmp, Readable.from([Buffer.from('{"formatVersion":6,"entries":[],"games":[]}')]));
  const outside = !fs.existsSync(path.join(root, "받는중A"));
  fs.mkdirSync(path.join(root, "받는중B"), { recursive: true });
  const made = cloudBackup.commit(dirs, "받는중B", "manual", "m.json.gz", tmp);
  check("클라우드 백업 — 받는 동안 연결 폴더를 안 만들고, 다 받은 뒤 그 순간의 이름 폴더로",
    outside && made.fileName === "m.json.gz" && fs.existsSync(path.join(root, "받는중B/manual/m.json.gz")) && !fs.existsSync(tmp)
    && (fs.statSync(path.join(root, "받는중B/manual/m.json.gz")).mode & 0o777) === 0o600, JSON.stringify(made));
  const read = await cloudBackup.read(dirs, "받는중B", "manual", "m.json.gz");
  check("클라우드 백업 — 흘려 쓴 gzip을 그대로 되읽는다", read.formatVersion === 6);

  // ⑧ 가벼운 검사 — 머리가 다르거나 꼬리가 끊긴 응답은 버린다
  const bad = async (text) => {
    const t = cloudBackup.stage(dirs);
    const r = await cloudBackup.gzipInto(t, Readable.from([Buffer.from(text)])).then(() => "통과", () => "거절");
    return r === "거절" && !fs.existsSync(t);
  };
  check("클라우드 백업 — 엉뚱한 응답·끊긴 응답은 거절하고 임시 파일을 치운다",
    (await bad("<html>not json</html>")) && (await bad('{"formatVersion":6,"entries":[{"x":')) && (await bad('{"error":1}')));
  for (const n of ["CaseA", "다른 연결", "새 이름", "고아"]) await js(`window.starlog.connections.remove(${JSON.stringify(n)})`);
}

realElectron.app.whenReady().then(async () => {
  try {
    await waitWindowLoaded();
    watchCsp();
    // 첫 로드는 감시를 붙이기 전이었다 — 한 번 더 받는다
    await goto("app://starlog/");
    check("입구 화면 로드 (app://)", win.webContents.getURL().startsWith("app://"), win.webContents.getURL());
    check("브리지 있음", await js("typeof window.starlog?.launch === 'function'"));

    const SAVE = "E2E 세이브";
    check("세이브 목록 비어 있음", (await js("window.starlog.saves.list()")).length === 0);
    check("세이브 이름 확인", (await js(`window.starlog.saves.create(${JSON.stringify(SAVE)})`)) === SAVE);

    let t = Date.now();
    const launched = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(SAVE)} })`);
    check("로컬 기동", launched.ok === true, `${Date.now() - t}ms, port=${launched.port}`);
    let port = launched.port;

    const me = await api(port, "GET", "/api/me");
    check("주인 계정 자동 생성", me.status === 200, `nickname=${me.json?.nickname ?? me.json?.profile?.nickname}`);
    const opts = await api(port, "GET", "/api/me/options");
    check("기본 카탈로그 심김", (opts.json?.platforms?.length ?? 0) >= 7, `플랫폼 ${opts.json?.platforms?.length}개`);

    await goto("app://starlog/dashboard");
    const dash = await js("document.body.innerText");
    check("대시보드 렌더 (app:// → API는 교차 출처)", /TOTAL GAMES/i.test(dash) && /\b0\b|\b1\b/.test(dash), `${dash.length}자`);

    // 다른 출처(아무 웹페이지)에서 API를 부르면 막혀야 한다 (`http/cors.ts`)
    const foreign = await fetch(`http://127.0.0.1:${port}/api/me`, { headers: { Origin: "https://evil.example" } });
    check("남의 출처 요청은 403", foreign.status === 403, String(foreign.status));

    const game = await api(port, "POST", "/api/games", { name: "E2E 테스트 게임" });
    const entry = await api(port, "POST", "/api/backlog", { gameId: game.json?.id });
    check("게임 담기", entry.status === 201, `game=${game.status} entry=${entry.status}`);

    await goto("app://starlog/library");
    const lib = await js("document.body.innerText");
    check("라이브러리에 담은 게임이 보인다", lib.includes("E2E 테스트 게임"));

    await goto(`app://starlog/library/detail?entry=${entry.json?.id}`);
    check("상세 화면", (await js("document.body.innerText")).includes("E2E 테스트 게임"));

    // 외부 일정 (2026-10-25) — 도장은 쓰기 없이 같은 값, 정리 탭은 빈 목록 + 연동 앱 이름이 화면에 없다
    const stamp1 = await api(port, "GET", "/api/external-plays/stamp");
    const stamp2 = await api(port, "GET", `/api/external-plays/stamp?entryId=${entry.json?.id}`);
    const stamp3 = await api(port, "GET", "/api/external-plays/stamp");
    check("외부 일정 도장 — 전체·항목별, 안 바뀌면 같은 값", stamp1.status === 200 && typeof stamp1.json?.stamp === "string"
      && stamp2.status === 200 && stamp1.json.stamp === stamp3.json?.stamp, `${stamp1.status} ${stamp2.status}`);
    await goto("app://starlog/system?tab=external");
    let sysText = "";
    for (let i = 0; i < 25 && !sysText.includes("연결 끊긴 외부 일정이 없습니다"); i += 1) {
      await sleep(200);
      sysText = await js("document.body.innerText");
    }
    const detachDisabled = await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "외부 캘린더 연결 해제")?.disabled ?? null`);
    check("시스템 → 외부 일정 — 빈 목록 안내, 연결 해제는 꺼짐, 화면에 연동 앱 이름 없음",
      sysText.includes("연결 끊긴 외부 일정이 없습니다") && detachDisabled === true && !/homeops/i.test(sysText),
      `${detachDisabled} ${sysText.split("\n").filter((l) => l.includes("외부")).join(" | ")}`);

    await mediaSteps(port, entry.json?.id);
    port = await mediaBackgroundSteps(SAVE, entry.json?.id);
    port = await ingestSteps(SAVE, entry.json?.id);
    await coverDbSteps(port, entry.json?.id);
    await coverResizeSteps(port, entry.json?.id);
    // 스크린샷·영상이 생긴 뒤에 — 상세의 갤러리 썸네일·<video>까지 정책 안에서 뜨는지
    await cspSteps(port, entry.json?.id);
    await securitySteps(port);
    await pathSteps(SAVE);

    // ── 입구로 → 백업 (백엔드를 내리고 묶는다) ──
    await goto("app://starlog/");
    await connectionSteps();
    await cloudBackupFolderSteps();
    await coverTargetSteps();
    // 배경 일 시험이 서버를 한 번 내렸다 올렸다 — 그때 자동 백업이 하나 생긴다
    const usageBefore = await js(`window.starlog.backups.usage(${JSON.stringify(SAVE)})`);
    t = Date.now();
    const backup = await js(`window.starlog.backups.create(${JSON.stringify(SAVE)})`);
    check("백업 만들기", /\.tar\.gz$/.test(backup.fileName), `${backup.fileName}, ${Date.now() - t}ms`);
    const usage = await js(`window.starlog.backups.usage(${JSON.stringify(SAVE)})`);
    check("백업 목록", usage.count === usageBefore.count + 1, `${usageBefore.count} → ${usage.count}, ${(usage.totalBytes / 1024 / 1024).toFixed(1)}MB`);

    const restored = await js(`window.starlog.backups.restore(${JSON.stringify(SAVE)}, ${JSON.stringify(backup.fileName)})`);
    const saves = await js("window.starlog.saves.list()");
    check("백업에서 새 세이브로 되살리기", saves.some((s) => s.name === restored), restored);

    const relaunch = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(restored)} })`);
    const cards = await api(relaunch.port, "GET", "/api/backlog/cards");
    const names = JSON.stringify(cards.json);
    check("되살린 세이브에 데이터가 있다", relaunch.ok && names.includes("E2E 테스트 게임"));
    const sameRestored = relaunch.ok ? await sameCover(relaunch.port, "E2E 테스트 게임") : "기동 실패";
    check("되살린 세이브에 DB 커버가 바이트째 있다 (.tar.gz 백업에 실린다)", sameRestored === true, String(sameRestored));

    // 같은 세이브를 바로 다시 열기 — 옛 백엔드가 잠금을 놓고 내려가야 한다 (DB_IN_USE 재발 방지)
    const again = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(SAVE)} })`);
    check("다른 세이브로 바로 전환", again.ok === true);
    const again2 = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(SAVE)} })`);
    check("같은 세이브를 바로 다시 열기", again2.ok === true);

    await robustnessSteps(SAVE, restored);
    await cloudBackupSteps(SAVE);

    const log = path.join(TMP, "appData/starlog/backend.log");
    check("backend.log — 0600", (fs.statSync(log).mode & 0o777) === 0o600);
    const dirs = path.join(TMP, "appData/starlog/data/saves");
    console.log(`\n세이브 폴더: ${fs.readdirSync(dirs).join(" · ")}`);
  } catch (e) {
    check("예외 없이 끝남", false, String(e?.stack ?? e));
  }

  // ── 종료: before-quit이 서버가 내려갈 때까지 기다리는지 ──
  realElectron.app.once("will-quit", () => {
    const saves = path.join(TMP, "appData/starlog/data/saves");
    const locks = fs.existsSync(saves) ? fs.readdirSync(saves).filter((f) => f.endsWith(".lock")) : [];
    check("종료 후 잠금 파일 없음", locks.length === 0, locks.join(","));
    const failed = results.filter((r) => !r.ok).length;
    const keep = Boolean(process.env.STARLOG_E2E_KEEP);
    console.log(`\n── ${results.length - failed} 통과 / ${failed} 실패  (임시 폴더: ${keep ? TMP : "지움 — 남기려면 STARLOG_E2E_KEEP=1"})`);
    if (keep) console.log(`── 서버 로그: ${path.join(TMP, "appData/starlog/backend.log")}`);
    // 세이브 여러 벌(PGlite 폴더)이 임시 폴더에 쌓이지 않게 — 실패를 들여다볼 땐 STARLOG_E2E_KEEP=1
    if (!process.env.STARLOG_E2E_KEEP) {
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* 다음 정리 때 */ }
    }
    // 일렉트론은 `process.exitCode`를 안 본다 — 실패가 있어도 0으로 끝나 CI·스크립트가 못 잡았다
    realElectron.app.exit(failed ? 1 : 0);
  });
  realElectron.app.quit();
});
