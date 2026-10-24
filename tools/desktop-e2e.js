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
