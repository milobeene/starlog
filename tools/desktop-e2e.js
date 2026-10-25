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
 * 클라우드 모드는 시험하지 않는다 — 실제 Neon에 붙기 때문이다.
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
    super({ ...options, show: false });
    win = this;
  }
  show() {}
  showInactive() {}
  focus() {}
  maximize() {}
}
const load = Module._load;
Module._load = function (request, ...rest) {
  const m = load.call(this, request, ...rest);
  if (request === "electron") {
    return new Proxy(m, { get: (t, k) => (k === "BrowserWindow" ? HiddenWindow : k === "shell" ? fakeShell : t[k]) });
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
  const made = fs.existsSync(thumbsDir) ? fs.readdirSync(thumbsDir).sort() : [];
  check("올릴 때 썸네일을 미리 만든다 (깨진 것 빼고 5장)", made.length === 5 && !made.includes(`${stored["broken.png"]}.jpg`), made.join(","));
  const srcMtime = fs.statSync(path.join(folder, stored["land.png"])).mtimeMs;
  const thumbMtime = fs.statSync(path.join(thumbsDir, `${stored["land.png"]}.jpg`)).mtimeMs;
  check("썸네일 수정시각 = 원본 수정시각 (신선도 표시)", Math.abs(srcMtime - thumbMtime) <= 1, `${srcMtime} / ${thumbMtime}`);

  // 썸네일을 지우고 다시 부르면 이 요청에서 만든다 (지연 생성) — 시간을 잰다
  fs.rmSync(thumbsDir, { recursive: true, force: true });
  const sizes = {};
  for (const [name] of plan) {
    const item = items.find((i) => i.fileName === stored[name]);
    if (!item?.thumbUrl) { sizes[name] = "thumbUrl 없음"; continue; }
    const t = Date.now();
    const res = await fetch(`http://127.0.0.1:${port}${item.thumbUrl}`, { headers: await auth() });
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
  check("WebP → QuickLook으로 (nativeImage가 못 푼다)", /^480x270/.test(sizes["pic.webp"] ?? ""));
  check("MP4 → 실제 장면 480×270", /^480x270/.test(sizes["clip.mp4"] ?? ""));
  check("깨진 이미지 → 썸네일 404 (아이콘을 썸네일로 쓰지 않는다)", /^404/.test(sizes["broken.png"] ?? ""));
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
  const ok = await media.makeThumbnail({ source: outside }, MEDIA_ROOT);
  check("메인 — 밖의 파일로는 썸네일을 안 만든다", ok === false && !fs.existsSync(path.join(TMP, ".thumbs")));
  fs.rmSync(path.join(folder, "link.png"));
  // `.thumbs`를 밖을 가리키는 링크로 바꿔치기 — 링크를 따라가 밖에 쓰면 안 된다
  const realThumbs = `${thumbsDir}.real`;
  const trap = path.join(TMP, "trap");
  fs.mkdirSync(trap);
  fs.renameSync(thumbsDir, realThumbs);
  fs.symlinkSync(trap, thumbsDir);
  const viaLink = await media.makeThumbnail({ source: path.join(folder, stored["square.png"]) }, MEDIA_ROOT);
  check("메인 — .thumbs가 심볼릭 링크면 썸네일을 안 쓴다", viaLink === false && fs.readdirSync(trap).length === 0, String(viaLink));
  fs.rmSync(thumbsDir);
  fs.renameSync(realThumbs, thumbsDir);

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
      ["connections:list"], ["saves:list"], ["settings:get"], ["connections:reveal", "x", "db.password"]]) {
      r[ch] = await window.raw.invoke(ch, ...args).then(() => "통과", () => "거절");
    }
    r.port = window.raw.sendSync("session:port");
    r.token = window.raw.sendSync("session:token");
    r.bg = window.raw.sendSync("background:get");
    return r;
  })()`);
  raw.destroy();
  check("IPC 발신자 검사 — 남의 문서의 invoke는 전부 거절 (media·connections·saves·settings)",
    ["media:copy", "connections:list", "saves:list", "settings:get", "connections:reveal"].every((k) => rawResults[k] === "거절"), JSON.stringify(rawResults));
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
    mediaTargets: { covers: false, screenshots: false },
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

  // 가린 값 그대로 저장 → 진짜 값 유지. 눈 버튼으로 칸 하나씩
  await js(`window.starlog.connections.list().then((l) => window.starlog.connections.save({ ...l[0], db: { ...l[0].db, user: "u2" } }))`);
  const revealed = await js(`Promise.all(${JSON.stringify(["db.password", "storage.accessKey", "storage.secretKey", "igdb.clientSecret", "translate.apiKey"])}.map((f) => window.starlog.connections.reveal("E2E 연결", f)))`);
  check("가린 값을 안 고치고 저장하면 진짜 값이 남는다 (reveal로 확인)", JSON.stringify(revealed) === JSON.stringify(SECRETS), JSON.stringify(revealed));
  // 이름 바꾸기 — 진짜 값은 옛 이름 쪽에서 푼다
  await js(`window.starlog.connections.list().then(async (l) => { await window.starlog.connections.save({ ...l[0], name: "E2E 연결2" }, { previousName: "E2E 연결" }); await window.starlog.connections.remove("E2E 연결"); })`);
  const renamed = await js(`window.starlog.connections.reveal("E2E 연결2", "db.password")`);
  check("이름을 바꿔도 가린 값이 진짜 값으로 이어진다 (previousName)", renamed === SECRETS[0], renamed);
  const forged = await js(`window.starlog.connections.reveal("E2E 연결2", "db.url").then(() => "통과", () => "거절")`);
  check("reveal — 비밀 칸이 아닌 이름은 거절", forged === "거절");

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

realElectron.app.whenReady().then(async () => {
  try {
    await waitWindowLoaded();
    check("입구 화면 로드 (app://)", win.webContents.getURL().startsWith("app://"), win.webContents.getURL());
    check("브리지 있음", await js("typeof window.starlog?.launch === 'function'"));

    const SAVE = "E2E 세이브";
    check("세이브 목록 비어 있음", (await js("window.starlog.saves.list()")).length === 0);
    check("세이브 이름 확인", (await js(`window.starlog.saves.create(${JSON.stringify(SAVE)})`)) === SAVE);

    let t = Date.now();
    const launched = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(SAVE)} })`);
    check("로컬 기동", launched.ok === true, `${Date.now() - t}ms, port=${launched.port}`);
    const port = launched.port;

    const me = await api(port, "GET", "/api/me");
    check("주인 계정 자동 생성", me.status === 200, `nickname=${me.json?.nickname ?? me.json?.profile?.nickname}`);
    const opts = await api(port, "GET", "/api/me/options");
    check("기본 카탈로그 심김", (opts.json?.platforms?.length ?? 0) >= 7, `플랫폼 ${opts.json?.platforms?.length}개`);

    await goto("app://starlog/dashboard");
    const dash = await js("document.body.innerText");
    check("대시보드 렌더 (app:// → API는 교차 출처)", /TOTAL GAMES/i.test(dash) && /\b0\b|\b1\b/.test(dash), `${dash.length}자`);

    // 다른 출처(아무 웹페이지)에서 API를 부르면 막혀야 한다 — 자바 DesktopCorsConfig와 같게
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

    await mediaSteps(port, entry.json?.id);
    await securitySteps(port);
    await pathSteps(SAVE);

    // ── 입구로 → 백업 (백엔드를 내리고 묶는다) ──
    await goto("app://starlog/");
    await connectionSteps();
    t = Date.now();
    const backup = await js(`window.starlog.backups.create(${JSON.stringify(SAVE)})`);
    check("백업 만들기", /\.tar\.gz$/.test(backup.fileName), `${backup.fileName}, ${Date.now() - t}ms`);
    const usage = await js(`window.starlog.backups.usage(${JSON.stringify(SAVE)})`);
    check("백업 목록", usage.count === 1, `${(usage.totalBytes / 1024 / 1024).toFixed(1)}MB`);

    const restored = await js(`window.starlog.backups.restore(${JSON.stringify(SAVE)}, ${JSON.stringify(backup.fileName)})`);
    const saves = await js("window.starlog.saves.list()");
    check("백업에서 새 세이브로 되살리기", saves.some((s) => s.name === restored), restored);

    const relaunch = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(restored)} })`);
    const cards = await api(relaunch.port, "GET", "/api/backlog/cards");
    const names = JSON.stringify(cards.json);
    check("되살린 세이브에 데이터가 있다", relaunch.ok && names.includes("E2E 테스트 게임"));

    // 같은 세이브를 바로 다시 열기 — 옛 백엔드가 잠금을 놓고 내려가야 한다 (DB_IN_USE 재발 방지)
    const again = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(SAVE)} })`);
    check("다른 세이브로 바로 전환", again.ok === true);
    const again2 = await js(`window.starlog.launch({ mode: "local", target: ${JSON.stringify(SAVE)} })`);
    check("같은 세이브를 바로 다시 열기", again2.ok === true);

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
    console.log(`\n── ${results.length - failed} 통과 / ${failed} 실패  (임시 폴더: ${TMP})`);
    console.log(`── 서버 로그: ${path.join(TMP, "appData/starlog/backend.log")}`);
    process.exitCode = failed ? 1 : 0;
  });
  realElectron.app.quit();
});
