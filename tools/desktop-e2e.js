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
const Module = require("module");

const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "starlog-e2e-"));

// ── 창 숨기기 + 경로 바꾸기 (main.js가 불리기 전에) ──
const realElectron = require("electron");
realElectron.app.setPath("appData", path.join(TMP, "appData"));
realElectron.app.setPath("userData", path.join(TMP, "userData"));
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
  if (request === "electron") return new Proxy(m, { get: (t, k) => (k === "BrowserWindow" ? HiddenWindow : t[k]) });
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
async function api(port, method, p, body) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
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
  const res = await fetch(`http://127.0.0.1:${port}/api/backlog/${entryId}/screenshots?takenAt=${takenAt}`, { method: "POST", body: fd });
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
    const res = await fetch(`http://127.0.0.1:${port}${item.thumbUrl}`);
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

  // ── 클립보드 (사용자 클립보드를 잠깐 빌린다 — 끝나면 되돌린다) ──
  const savedText = clipboard.readText();
  const savedImage = clipboard.readImage();
  try {
    const ref = (n) => JSON.stringify({ entryId, fileName: stored[n] });
    const c1 = await js(`window.starlog.media.copy(${ref("land.png")})`);
    const pasted = clipboard.readImage().getSize();
    check("복사 — 사진은 그림으로", c1.ok && c1.as === "image" && pasted.width === 2560 && pasted.height === 1440, `${JSON.stringify(c1)} ${JSON.stringify(pasted)}`);
    const c2 = await js(`window.starlog.media.copy(${ref("clip.mp4")})`);
    const fileUrl = clipboard.readBuffer("public.file-url").toString("utf8");
    check("복사 — 영상은 파일 참조로 (맥 public.file-url)", c2.ok && c2.as === "file" && fileUrl.endsWith(`/${stored["clip.mp4"]}`), `${JSON.stringify(c2)} ${fileUrl}`);
    const c3 = await js(`window.starlog.media.copy(${ref("pic.webp")})`);
    check("복사 — WebP도 파일 참조로", c3.ok && c3.as === "file");
    const c4 = await js(`window.starlog.media.copy({ entryId: ${entryId}, fileName: "../../../outside.png" })`);
    check("복사 — 폴더 탈출 이름은 NOT_FOUND", c4.ok === false && c4.reason === "NOT_FOUND", JSON.stringify(c4));
    const c5 = await js(`window.starlog.media.copy({ entryId: "1; rm", fileName: "x" }).then(() => "통과", (e) => "거절")`);
    check("복사 — 형식이 틀린 참조는 거절", c5 === "거절");
  } finally {
    if (!savedImage.isEmpty()) clipboard.writeImage(savedImage); else clipboard.writeText(savedText);
  }

  // ── 다른 창(우리 앱 문서가 아님)에서는 못 부른다 ──
  const stranger = new RealWindow({ show: false, webPreferences: { contextIsolation: true, preload: path.join(ROOT, "desktop/preload.js") } });
  await stranger.loadURL("data:text/html,stranger");
  const denied = await stranger.webContents.executeJavaScript(
    `window.starlog.media.copy({ entryId: ${entryId}, fileName: ${JSON.stringify(stored["land.png"])} }).then(() => "통과", (e) => "거절")`);
  stranger.destroy();
  check("IPC 발신자 검사 — app://starlog 밖의 창은 거절", denied === "거절");

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

    // ── 입구로 → 백업 (백엔드를 내리고 묶는다) ──
    await goto("app://starlog/");
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
