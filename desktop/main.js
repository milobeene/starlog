/**
 * STARLOG 데스크탑 — v1.0 5단계.
 *
 * ## 순서가 뒤집혀 있다
 *
 * 보통은 서버를 띄우고 화면을 연다. 여기는 **화면을 먼저 열고 서버를 나중에** 띄운다.
 * 스프링은 부팅할 때 DataSource·커넥션풀·JPA 메타모델·Flyway를 한 번에 조립하는데,
 * 조립이 끝난 뒤 DB를 바꾸는 건 엔진 돌아가는 중에 엔진을 가는 것과 같다.
 *
 *   1. 일렉트론이 뜬다                    ← 백엔드 없음
 *   2. 입구 화면을 app:// 로 로드          ← 순수 프론트, DB 필요 없음
 *   3. 사용자가 모드와 대상을 고른다
 *   4. 빈 포트를 찾아 스프링을 spawn       ← 설정을 인자·환경변수로 주입
 *   5. 진단 통과하면 창을 본 앱으로 이동
 *
 * **스프링은 매번 "이미 정해진 DB"만 본다 → 백엔드 코드가 한 줄도 안 바뀐다.**
 * → docs/v1.0-architecture.md §2
 */
const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");

const paths = require("./paths");
const store = require("./settings");
const backup = require("./backup");

const ROOT = path.join(__dirname, "..");
const JAR = path.join(ROOT, "backend", "build", "libs", "app.jar");
/** 입구 화면용 정적 파일. build-desktop.sh가 jar 안과 여기 둘 다에 넣는다 */
const WEB = path.join(__dirname, "web");

let backend = null;
let backendPort = null;
let win = null;
/** 우리가 일부러 죽인 건지, 저 혼자 죽은 건지 구분한다 — 후자만 사용자에게 알린다 */
let stoppingOnPurpose = false;
/**
 * 지금 이 백엔드가 무엇을 열고 있나 — `{ mode, target }`.
 *
 * 입구로 나가도 백엔드를 안 죽이기로 하면서 필요해졌다. 창은 입구인데 서버는 살아 있는
 * 상태가 생기고, 그때 **"최근 접속"이 즉시 이동인지 새로 기동인지**를 이 값이 가른다
 */
let session = null;

/*
 * ## app:// 를 "진짜 오리진"으로 등록한다
 *
 * `file://`로 열면 Next가 뽑아둔 `/_next/...` **절대 경로가 전부 깨진다**
 * (파일시스템 루트를 가리켜버린다). 커스텀 스킴을 standard로 등록하면 호스트와
 * 절대 경로 개념이 생겨서 웹서버에 올린 것과 똑같이 동작한다.
 *
 * ⚠️ **`app.whenReady()` 전에 불러야 한다.** 뒤로 가면 조용히 무시된다
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/**
 * 정적 내보내기의 파일 모양에 맞춰 이어 붙인다 — 스프링의 `StaticSiteConfig`와 같은 규칙이다.
 * `/` → `index.html`, `/dashboard` → `dashboard.html`.
 *
 * 두 곳에 같은 규칙이 있는 게 중복처럼 보이지만, **입구는 스프링이 뜨기 전에 떠야 해서**
 * 스프링의 것을 쓸 수가 없다. 이게 "프론트가 두 오리진에서 뜬다"의 대가다
 */
function resolveWebFile(pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidates = clean === "" ? ["index.html"] : [clean, `${clean}.html`, `${clean}/index.html`];
  for (const candidate of candidates) {
    const full = path.join(WEB, candidate);
    // 경로 탈출 방지 — `app://x/../../etc/passwd` 같은 요청이 WEB 밖으로 못 나간다
    if (!full.startsWith(WEB + path.sep)) continue;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function serveWeb(request) {
  const file = resolveWebFile(new URL(request.url).pathname);
  if (!file) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(fs.readFileSync(file), {
    headers: { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" },
  });
}

/** 포트 0으로 열면 OS가 빈 포트를 준다. 직접 고르면 경합을 우리가 떠안는다 */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** 우리 백엔드에 JSON을 묻는다. 작은 요청뿐이라 스트리밍은 필요 없다 */
function getJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: urlPath }, (res) => {
      /*
       * ⚠️ **`setEncoding`이 없으면 한글이 깨진다.**
       *
       * Buffer를 문자열에 더하면 **청크마다 따로** UTF-8로 바뀐다. 한글은 3바이트라
       * 글자 하나가 64KB 경계에 걸치면 반씩 쪼개져 `??`가 된다 — 실제로 게임 이름
       * 하나가 그렇게 깨졌고, 경계에 걸린 그 한 줄만 깨져서 원인을 찾기 어려웠다.
       * `setEncoding`은 StringDecoder를 써서 걸친 바이트를 다음 청크까지 들고 간다
       */
      res.setEncoding("utf8");
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`${urlPath} → ${res.statusCode}`));
        else resolve(JSON.parse(body));
      });
    }).on("error", reject);
  });
}

function postJson(port, urlPath, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const req = http.request({
      host: "127.0.0.1", port, path: urlPath, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": body.length },
    }, (res) => {
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`${urlPath} → ${res.statusCode} ${text}`));
        else resolve(text ? JSON.parse(text) : null);
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

function progress(payload) {
  if (win && !win.isDestroyed()) win.webContents.send("launch:progress", payload);
}

/**
 * 스프링이 응답할 때까지 기다린다.
 *
 * 로그의 "Started ...Application"을 보는 방법도 있지만 **문자열에 기대는 건 약하다.**
 * 실제로 HTTP가 도는지를 본다 — 무슨 상태코드든 대답하면 살아난 것이다
 */
/**
 * @param isAlive 프로세스가 아직 살아 있나. **전역 `backend`를 보면 안 된다** —
 *                시험용 백엔드(`spawnProbe`)는 전역에 안 들어가서, 입구 화면처럼 본 백엔드가
 *                없을 때 **즉시 거부**됐다. 그러면 `connections:test`가 `done = null`을 받고
 *                `!done?.diagnostic`이 true가 되어 **DB가 성공한 것처럼 보고**했다.
 *                1초도 안 걸려 "DB는 됐고 나머지는 실패"가 뜨던 이유가 이것이다
 */
function waitForBackend(port, timeoutMs = 90_000, isAlive = () => backend !== null) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (!isAlive()) return reject(new Error("BACKEND_DIED"));
      const req = http.get({ host: "127.0.0.1", port, path: "/api/me", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("TIMEOUT"));
        else setTimeout(tick, 400);
      });
      req.on("timeout", () => req.destroy());
    };
    tick();
  });
}

/**
 * 백엔드를 띄운다.
 *
 * ## 인자와 환경변수를 갈라 쓴다
 *
 * 포트·프로필은 인자로, **DB 비번과 스토리지 키는 환경변수로** 넘긴다.
 * `--spring.datasource.password=...`로 주면 `ps`에 그대로 찍히기 때문이다.
 * 스프링은 두 경로를 똑같이 읽으므로(relaxed binding) 여기만의 규칙이 아니다.
 *
 * 진단(`--starlog.diagnose=true`)은 일렉트론이 띄울 때만 켠다 —
 * 개발자가 `bootRun`으로 띄우는 길에는 안 끼어든다
 */
function startBackend(port, config) {
  if (!fs.existsSync(JAR)) {
    throw new Error(`jar가 없습니다: ${JAR}\ntools/build-desktop.sh 를 먼저 실행하세요`);
  }
  const out = fs.createWriteStream(paths.LOG_FILE, { flags: "a" });
  out.write(`\n===== ${new Date().toISOString()} port=${port} mode=${config.mode} =====\n`);

  const args = [
    "-jar", JAR,
    `--server.port=${port}`,
    "--spring.profiles.active=desktop",
    "--starlog.diagnose=true",
    `--spring.datasource.url=${config.url}`,
    `--spring.datasource.driver-class-name=${config.driver}`,
  ];

  const env = { ...process.env };
  env.SPRING_DATASOURCE_USERNAME = config.username ?? "";
  env.SPRING_DATASOURCE_PASSWORD = config.password ?? "";
  for (const [key, value] of Object.entries(config.env ?? {})) {
    if (value) env[key] = value;
  }

  stoppingOnPurpose = false;
  backend = spawn(paths.javaBin(), args, { stdio: ["ignore", "pipe", "pipe"], env });
  backendPort = port;

  /*
   * 진단 결과를 stdout에서 긁는다. 로그 파일로도 그대로 흘려보내므로
   * 나중에 사람이 로그만 봐도 같은 줄이 있다
   */
  let diagnostic = null;
  backend.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    const found = text.match(/STARLOG_DIAGNOSTIC:\s*([A-Z_]+)/);
    if (found) diagnostic = found[1];
  });
  backend.stdout.pipe(out);
  backend.stderr.pipe(out);

  const exited = new Promise((resolve) => {
    backend.on("exit", (code) => {
      backend = null;
      backendPort = null;
      resolve({ code, diagnostic });
      if (!stoppingOnPurpose) onBackendDied(code, diagnostic);
    });
  });

  return { exited, getDiagnostic: () => diagnostic };
}

/**
 * 백엔드가 저 혼자 죽었다 (architecture §2 "딸려오는 자잘한 일" 5번).
 *
 * 이걸 안 잡으면 화면이 그대로 남은 채 모든 요청이 실패해서
 * **앱이 고장 난 게 아니라 데이터가 사라진 것처럼 보인다.** 입구로 되돌린다
 */
function onBackendDied(code, diagnostic) {
  if (!win || win.isDestroyed()) return;
  loadEntry();
  progress({ phase: "error", code: diagnostic ?? "BACKEND_DIED", exitCode: code });
}

/**
 * 좀비 프로세스 방지. SIGTERM으로 먼저 부탁하고, 안 죽으면 SIGKILL.
 *
 * ⚠️ **윈도우는 신호 체계가 달라 `taskkill /T`가 필요할 수 있다 — 10단계에서 확인한다.**
 * 맥에서는 일렉트론만 죽여도 java가 따라 죽는 것까지 확인했다
 */
/**
 * 시험용 백엔드 (2026-08-28).
 *
 * **본 백엔드(`backend`)와 완전히 따로 논다.** 전역 상태를 안 건드리는 게 요점이다 —
 * 예전엔 연결 테스트가 본 백엔드를 죽였다 되살렸고, 그때 **포트가 바뀌어서** 창이
 * 옛 포트를 보며 `Failed to fetch`를 뱉었다.
 *
 * 죽음 감지(`onBackendDied`)도 안 붙인다. 시험용은 끝나면 죽는 게 정상이라
 * 붙이면 매번 "서버가 예기치 않게 종료됐습니다"가 뜬다
 */
function spawnProbe(port, config) {
  const args = [
    "-jar", JAR,
    `--server.port=${port}`,
    "--spring.profiles.active=desktop",
    "--starlog.diagnose=true",
    `--spring.datasource.url=${config.url}`,
    `--spring.datasource.driver-class-name=${config.driver}`,
  ];
  const env = { ...process.env };
  env.SPRING_DATASOURCE_USERNAME = config.username ?? "";
  env.SPRING_DATASOURCE_PASSWORD = config.password ?? "";
  for (const [key, value] of Object.entries(config.env ?? {})) {
    if (value) env[key] = value;
  }

  const proc = spawn(paths.javaBin(), args, { stdio: ["ignore", "pipe", "pipe"], env });
  let diagnostic = null;
  proc.stdout.on("data", (chunk) => {
    const found = chunk.toString().match(/STARLOG_DIAGNOSTIC:\s*([A-Z_]+)/);
    if (found) diagnostic = found[1];
  });
  // 시험용 로그도 남긴다 — 왜 실패했는지 볼 데가 있어야 한다
  const out = fs.createWriteStream(paths.LOG_FILE, { flags: "a" });
  proc.stdout.pipe(out);
  proc.stderr.pipe(out);

  let running = true;
  const exited = new Promise((resolve) => {
    proc.on("exit", (code) => {
      running = false;
      resolve({ code, diagnostic });
    });
  });

  return {
    exited,
    isAlive: () => running,
    stop() {
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* 이미 죽었으면 무시 */ }
      }, 3000);
    },
  };
}

/**
 * 백엔드를 내리고 **완전히 죽을 때까지 기다린다.**
 *
 * ⚠️ **기다리는 게 요점이다.** 신호만 보내고 넘어가면 H2가 아직 `.mv.db` 잠금을 쥔 채인데
 * 곧바로 같은 파일로 다시 띄우게 되고, 그러면 `DB_IN_USE`로 간헐적으로 실패한다.
 * 재현이 잘 안 되는 부류라 처음부터 기다리게 만든다.
 *
 * 백업도 이 함수에 기댄다 — 파일을 복사하려면 아무도 안 열고 있어야 한다
 */
function stopBackend() {
  if (!backend) {
    session = null;
    return Promise.resolve();
  }
  const proc = backend;
  stoppingOnPurpose = true;
  backend = null;
  backendPort = null;
  session = null;

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    proc.once("exit", finish);
    proc.kill("SIGTERM");

    // 얌전히 안 죽으면 강제로. 그래도 H2 MVStore는 크래시에 견디게 만들어져 있다
    setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* 이미 죽었으면 무시 */ }
      setTimeout(finish, 500);
    }, 5000);
  });
}

function loadEntry() {
  win.loadURL("app://starlog/");
}

function createWindow() {
  const { window: saved } = store.getSettings();
  win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    /*
     * 반응형을 폰 폭(390px)까지 넣어서 하한을 크게 낮췄다 (architecture §10-7).
     * 380으로 잡은 이유 — 그 아래는 아이폰 14보다 좁아 실기기에도 없는 폭이다
     */
    minWidth: 380,
    minHeight: 480,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.once("ready-to-show", () => win.show());
  if (saved.maximized) win.maximize();

  // 외부 링크는 앱 안이 아니라 기본 브라우저로 (IGDB 출처 표기 등)
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 창 크기를 기억한다 (결정 44). 최대화 상태면 크기가 아니라 그 사실을 저장한다
  win.on("close", () => {
    if (win.isDestroyed()) return;
    const bounds = win.getNormalBounds();
    store.patchSettings({
      window: { width: bounds.width, height: bounds.height, maximized: win.isMaximized() },
    });
  });

  loadEntry();
}

// ───────────────────────── IPC ─────────────────────────

const SAVE_NAME = /^[가-힣a-zA-Z0-9 _.-]{1,50}$/;

/** 이름이 곧 파일명이다. 경로 구분자나 `..`이 섞이면 saves/ 밖으로 나간다 */
function assertSaveName(name) {
  const trimmed = (name ?? "").trim();
  if (!SAVE_NAME.test(trimmed) || trimmed.includes("..")) {
    throw new Error("이름은 한글·영문·숫자·공백·_-. 만 쓸 수 있습니다 (50자 이내)");
  }
  return trimmed;
}

function dataDirs() {
  return paths.ensureDataRoot(store.getSettings().dataRoot);
}

function registerIpc() {
  ipcMain.handle("settings:get", () => {
    const settings = store.getSettings();
    return { ...settings, dirs: paths.ensureDataRoot(settings.dataRoot) };
  });

  ipcMain.handle("settings:setDataRoot", (_e, dir) => {
    paths.ensureDataRoot(dir);
    return store.patchSettings({ dataRoot: dir });
  });

  /**
   * 경로를 바꾸기 전에 살펴본다.
   *
   * **경로가 이상한 걸 저장한 뒤에 알게 하면 안 된다** — 세이브파일이 엉뚱한 데로 가고
   * 그제서야 "왜 목록이 비었지"가 된다. 만들 수 있는지, 이미 우리 구조가 있는지 미리 답한다
   */
  ipcMain.handle("settings:inspectDataRoot", (_e, dir) => {
    const target = String(dir ?? "").trim();
    if (!target) {
      return { ok: false, reason: "경로를 입력해 주세요" };
    }
    if (!path.isAbsolute(target)) {
      return { ok: false, reason: "전체 경로를 입력해 주세요 (/ 로 시작)" };
    }

    const resolved = path.resolve(target);
    const parent = path.dirname(resolved);
    if (!fs.existsSync(parent)) {
      return { ok: false, reason: "상위 폴더가 없습니다: " + parent };
    }
    try {
      fs.accessSync(parent, fs.constants.W_OK);
    } catch {
      return { ok: false, reason: "이 위치에 쓸 권한이 없습니다" };
    }

    const exists = fs.existsSync(resolved);
    const dirs = ["saves", "backups", "covers", "media"];
    const ready = exists && dirs.every((d) => fs.existsSync(path.join(resolved, d)));
    const saveCount = ready
      ? fs.readdirSync(path.join(resolved, "saves")).filter((f) => f.endsWith(".mv.db")).length
      : 0;

    return { ok: true, path: resolved, exists, ready, saveCount };
  });

  ipcMain.handle("dialog:pickFolder", async () => {
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("shell:openFolder", (_e, which) => {
    // 자격증명이 있는 앱 폴더. **데이터 루트와 다른 곳**이라는 걸 눈으로 보게 한다 (§7)
    if (which === "appData") {
      shell.openPath(paths.APP_DATA);
      return;
    }
    const dirs = dataDirs();
    shell.openPath(dirs[which] ?? dirs.root);
  });

  /**
   * 절대 경로를 탐색기로 연다 (스크린샷 폴더).
   *
   * 백엔드가 경로를 알려주고 여는 것은 네이티브가 한다 — 브라우저는 로컬 경로를 못 연다.
   * ⚠️ **데이터 루트 안인지 확인한다.** 경로가 화면을 거쳐 오므로,
   * 확인 없이 열면 `openPath("/etc")` 같은 요청도 그대로 통한다
   */
  ipcMain.handle("shell:openPath", (_e, target) => {
    const dirs = dataDirs();
    const resolved = path.resolve(target);
    if (!resolved.startsWith(path.resolve(dirs.root))) {
      throw new Error("데이터 폴더 밖은 열 수 없습니다");
    }
    shell.openPath(resolved);
  });

  ipcMain.handle("saves:list", () => {
    const { saves } = dataDirs();
    return fs.readdirSync(saves)
      .filter((f) => f.endsWith(".mv.db"))
      .map((f) => {
        const stat = fs.statSync(path.join(saves, f));
        return {
          name: f.replace(/\.mv\.db$/, ""),
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  });

  /*
   * 파일을 미리 만들지 않는다 — H2가 첫 접속에 만든다.
   * 여기서 빈 파일을 찍으면 H2가 "손상된 DB"로 보고 거부한다.
   * 그래서 이 핸들러가 하는 일은 **이름 검사와 중복 확인**뿐이다
   */
  ipcMain.handle("saves:create", (_e, name) => {
    const clean = assertSaveName(name);
    const { saves } = dataDirs();
    if (fs.existsSync(path.join(saves, `${clean}.mv.db`))) {
      throw new Error("같은 이름의 세이브파일이 이미 있습니다");
    }
    return clean;
  });

  ipcMain.handle("saves:remove", async (_e, name) => {
    const clean = assertSaveName(name);
    // 열고 있는 파일은 못 지운다 — 윈도우는 아예 거부하고, 맥은 지워지되 서버가 유령을 붙든다
    if (session?.mode === "local" && session.target === clean) {
      await stopBackend();
    }

    const dirs = dataDirs();
    // .trace.db는 H2가 오류를 남기는 곁다리 파일이다. 같이 지운다
    for (const suffix of [".mv.db", ".trace.db"]) {
      const file = path.join(dirs.saves, `${clean}${suffix}`);
      if (fs.existsSync(file)) fs.rmSync(file);
    }
    // 백업도 함께. 남겨두면 주인 없는 폴더가 쌓이고, 목록에서 지운 것이 되살아난 것처럼 보인다
    backup.removeAll(dirs, clean);
    return true;
  });

  // ── 백업 (9단계). 전부 일렉트론이 한다 — 백엔드는 백업 폴더에 손을 안 댄다

  ipcMain.handle("backups:usage", (_e, saveName) =>
    backup.usage(dataDirs(), assertSaveName(saveName)));

  /**
   * 수동 백업.
   *
   * **지금 열려 있는 세이브면 서버를 내리고 한다.** 파일을 복사하려면 아무도 안 열고
   * 있어야 하기 때문이다. 다른 세이브는 아무도 안 열고 있으니 그냥 복사한다 —
   * 실제로는 이쪽이 더 흔하고, 굳이 멈출 이유가 없다.
   *
   * 안내를 따로 띄우지 않는다 (사용자 결정). 대신 이 뒤로 [최근 접속]이
   * "즉시"에서 "기동"으로 조용히 바뀐다 — 알아채도 이상하지 않은 변화다
   */
  ipcMain.handle("backups:create", async (_e, saveName) => {
    const clean = assertSaveName(saveName);
    if (session?.mode === "local" && session.target === clean) {
      await stopBackend();
    }
    return backup.create(dataDirs(), clean);
  });

  /** 되돌리기 — 새 세이브파일이 하나 생긴다. 원본은 그대로 남는다 */
  ipcMain.handle("backups:restore", (_e, saveName, fileName) =>
    backup.restore(dataDirs(), assertSaveName(saveName), fileName));

  ipcMain.handle("backups:remove", (_e, saveName, fileName) => {
    backup.remove(dataDirs(), assertSaveName(saveName), fileName);
    return true;
  });

  ipcMain.handle("connections:list", () => store.getConnections());
  ipcMain.handle("connections:save", (_e, profile) => store.saveConnection(profile));
  ipcMain.handle("connections:remove", (_e, name) => store.removeConnection(name));

  /**
   * 연결 테스트 = 백엔드를 진단만 시키고 죽인다.
   *
   * Node에서 직접 붙어보는 방법도 있지만 **PG 드라이버를 Node에도 또 넣어야** 하고,
   * 버전이 어긋나면 "일렉트론은 되는데 스프링은 안 되는" 상황이 난다 (architecture §3)
   */
  /**
   * 연결 테스트 (2026-08-28 전면 수정).
   *
   * ## 🔴 지금 쓰는 백엔드를 절대 안 건드린다
   *
   * 예전엔 죽였다가 되살렸는데, **되살릴 때 포트가 바뀐다.** 창은 옛 포트를 보고 있으니
   * 그 뒤로 앱 전체가 `TypeError: Failed to fetch`가 됐다 — 새로고침하면 검은 화면.
   * "다음에 들어올 때 적용됩니다"라고 해놓고 사실상 재접속을 강제한 셈이었다.
   *
   * 죽일 이유도 없었다. 시험 대상은 **PostgreSQL이라 동시 접속이 된다** —
   * H2 파일 잠금 같은 게 없다. 그냥 다른 포트에 시험용을 하나 더 띄우고 내리면 끝이다
   */
  ipcMain.handle("connections:test", async (_e, profile) => {
    const port = await freePort();
    const probe = spawnProbe(port, cloudConfig(profile));

    /*
     * ⚠️ **시험용의 생사를 넘겨야 한다.** 기본값은 전역 `backend`를 보는데 시험용은 거기 없어서,
     * 안 넘기면 즉시 "죽었다"로 판정하고 **DB가 성공한 것처럼** 보고한다
     */
    const ready = await Promise.race([
      probe.exited,
      waitForBackend(port, 90_000, probe.isAlive)
        .then(() => ({ code: 0, diagnostic: null }))
        .catch((e) => ({ code: -1, diagnostic: e.message === "TIMEOUT" ? "TIMEOUT" : null })),
    ]);
    const done = ready;

    /*
     * DB가 떴으면 스토리지·IGDB도 실제로 눌러본다.
     *
     * **"연결 실패" 한 줄이면 어디가 문제인지 알 수가 없다** — 사용자가 키를 안 넣고
     * 접속했다가 빈 화면만 하염없이 본 게 이 기능의 출발점이다
     */
    let storage = null;
    let igdb = null;
    if (!done?.diagnostic) {
      const hasStorage = profile.storage?.endpoint && profile.storage?.bucket;
      const hasIgdb = profile.igdb?.clientId && profile.igdb?.clientSecret;
      if (hasIgdb) {
        igdb = await postJson(port, "/api/system/settings/igdb/test", {
          clientId: profile.igdb.clientId,
          clientSecret: profile.igdb.clientSecret,
        }).catch((e) => ({ ok: false, message: String(e.message ?? e) }));
      }
      if (hasStorage) {
        /*
         * ⚠️ **실제로 버킷을 눌러본다.** 예전엔 `/api/system`의 `configured`만 봤는데
         * 그건 "값이 채워져 있나"일 뿐이라 **비밀번호를 틀려도 통과했다.**
         * 자격증명이 맞는지는 스토리지에 물어봐야만 알 수 있다
         */
        storage = await getJson(port, "/api/system/storage/check")
          .catch((e) => ({ ok: false, message: String(e.message ?? e) }));
      }
    }

    probe.stop();

    return {
      ok: !done?.diagnostic && (igdb?.ok ?? true) && (storage?.ok ?? true),
      code: done?.diagnostic ?? null,
      database: { ok: !done?.diagnostic },
      storage,
      igdb,
    };
  });

  ipcMain.handle("launch", async (_e, request) => {
    const config = request.mode === "local"
      ? localConfig(assertSaveName(request.target))
      : cloudConfig(findProfile(request.target));

    /*
     * ⚠️ **먼저 옛 백엔드를 죽이고 기다린다.**
     *
     * 입구로 나가도 백엔드를 안 죽이기로 하면서 여기가 위험해졌다 — 살아 있는 놈이
     * `.mv.db`를 쥔 채로 같은 파일을 다시 열면 `DB_IN_USE`다.
     * 다른 세이브를 골랐더라도 마찬가지로 죽인다: 백엔드는 한 번에 하나면 충분하고,
     * 둘을 살려두면 "지금 보고 있는 게 어느 쪽이냐"가 흐려진다
     */
    progress({ phase: "starting" });
    await stopBackend();

    /*
     * 로컬 모드는 띄우기 **전에** 백업한다. DB가 닫혀 있는 유일한 순간이라
     * 그냥 파일을 복사하면 되고, 스키마 자동 업그레이드가 일어난다면 그 직전이 된다.
     * 실패해도 기동은 막지 않는다 — 백업이 본체를 막으면 본말전도다
     */
    if (request.mode === "local") {
      try {
        backup.autoBackup(dataDirs(), request.target);
      } catch (e) {
        console.error("[backup] 자동 백업 실패 — 기동은 계속한다", e);
      }
    }

    const port = await freePort();
    const { exited } = startBackend(port, config);

    progress({ phase: "waiting" });
    try {
      await waitForBackend(port);
    } catch {
      const result = await exited;
      const code = result?.diagnostic ?? "BACKEND_DIED";
      progress({ phase: "error", code });
      return { ok: false, code };
    }

    session = { mode: request.mode, target: request.target };
    store.patchSettings({ lastMode: request.mode, lastTarget: request.target });
    progress({ phase: "ready" });
    win.loadURL(`http://127.0.0.1:${port}/dashboard`);
    return { ok: true };
  });

  /**
   * 입구로 나간다. **백엔드는 그대로 둔다** (2026-08-28 결정).
   *
   * 예전엔 여기서 죽였다 — "DB를 갈아끼우러 나가는 것"으로 봤기 때문이다.
   * 그런데 실제로는 잘못 들어왔거나 설정을 보러 나가는 쪽이 훨씬 흔하고,
   * 그때마다 5초를 다시 기다리는 건 값을 못 한다. 살려두면 [최근 접속]이 **즉시**다
   */
  /**
   * 클라우드 데이터를 **로컬 세이브파일로 뽑는다** (architecture §6).
   *
   * ## "복원"이라는 과정이 없다
   *
   * 세이브파일이 H2 파일 그 자체라서, 뽑아낸 순간 그건 이미 열 수 있는 상태다.
   * 백업 파일을 어딘가에 두고 나중에 되돌리는 절차가 아예 생기지 않는다.
   *
   * ## 이미 있는 것을 쓴다
   *
   * architecture는 "JDBC로 행을 복사"라고 했지만, **`/api/me/export`와 `import`가 이미 있고
   * 실데이터로 검증까지 됐다.** 직접 복사로 가면 identity 시퀀스 리셋과 FK 순서를 새로 짜야 하고,
   * 이 규모(항목 수십 건)에서 그 값을 못 한다.
   *
   * 새로 만들 것은 **빈 세이브파일에 스키마를 만드는 부분**뿐인데, 그것도 백엔드를 한 번
   * 띄우면 Flyway가 알아서 한다. 그래서 흐름이 이렇게 된다:
   *
   * <pre>
   *   1. 지금 붙어 있는 클라우드에서 JSON을 받는다
   *   2. 새 이름으로 로컬 백엔드를 잠깐 띄운다 → Flyway가 빈 스키마를 만든다
   *   3. 그 백엔드에 JSON을 부어넣는다
   *   4. 내린다. 세이브파일 하나가 남는다
   * </pre>
   *
   * ⚠️ **커버 실물은 안 따라온다.** 클라우드 커버는 스토리지에 있다.
   * 가져오기가 "파일 없으면 건너뛴다"로 처리하므로 마스터 커버로 폴백된다 —
   * 화면이 그걸 미리 말해준다
   */
  ipcMain.handle("cloud:toSaveFile", async (_e, saveName) => {
    if (session?.mode !== "cloud" || !backendPort) {
      throw new Error("클라우드 모드로 접속 중일 때만 뽑을 수 있습니다");
    }
    const clean = assertSaveName(saveName);
    const dirs = dataDirs();
    if (fs.existsSync(path.join(dirs.saves, `${clean}.mv.db`))) {
      throw new Error("같은 이름의 세이브파일이 이미 있습니다");
    }

    progress({ phase: "starting" });
    const dump = await getJson(backendPort, "/api/me/export");

    // 클라우드 연결은 그대로 둔다 — 뽑기가 실패해도 보던 화면으로 돌아갈 수 있어야 한다
    const cloudPort = backendPort;
    const cloudSession = session;
    await stopBackend();

    progress({ phase: "waiting" });
    const port = await freePort();
    const { exited } = startBackend(port, localConfig(clean));
    try {
      await waitForBackend(port);
      await postJson(port, "/api/me/import", dump);
    } catch (e) {
      await stopBackend();
      const result = await exited;
      progress({ phase: "error", code: result?.diagnostic ?? "BACKEND_DIED" });
      throw e;
    }
    await stopBackend();

    /*
     * 뽑기 전에 보던 클라우드로 되돌린다. 포트가 바뀌므로 다시 띄워야 한다 —
     * 그래도 **사용자가 고르는 단계를 다시 밟게 하지는 않는다**
     */
    void cloudPort;
    const back = await freePort();
    startBackend(back, cloudConfig(findProfile(cloudSession.target)));
    try {
      await waitForBackend(back);
      session = cloudSession;
      progress({ phase: "ready" });
    } catch {
      progress({ phase: "error", code: "BACKEND_DIED" });
    }

    return { saveName: clean };
  });

  ipcMain.handle("backToEntry", () => {
    loadEntry();
    return true;
  });

  /** 입구 화면이 [최근 접속] 버튼을 그릴지, 그게 즉시인지 기동인지 정하는 데 쓴다 */
  ipcMain.handle("session:current", () => {
    const settings = store.getSettings();
    if (session && backendPort) {
      return { ...session, alive: true };
    }
    // 서버는 없지만 지난번 기록은 있다 — 고르는 단계를 건너뛸 수는 있다
    if (settings.lastMode && settings.lastTarget) {
      return { mode: settings.lastMode, target: settings.lastTarget, alive: false };
    }
    return null;
  });

  /** 살아 있는 백엔드로 되돌아간다. 창만 옮기면 끝이라 기다릴 게 없다 */
  ipcMain.handle("session:resume", () => {
    if (!session || !backendPort) {
      return false;
    }
    win.loadURL(`http://127.0.0.1:${backendPort}/dashboard`);
    return true;
  });
}

function findProfile(name) {
  const found = store.getConnections().find((p) => p.name === name);
  if (!found) throw new Error(`연결 설정을 찾을 수 없습니다: ${name}`);
  return found;
}

function localConfig(saveName) {
  const { dataRoot } = store.getSettings();
  return {
    mode: "local",
    url: paths.saveFileUrl(dataRoot, saveName),
    driver: "org.h2.Driver",
    username: "sa",
    password: "",
    /*
     * 로컬 모드에도 커버 폴더 경로는 넘긴다. 6단계에서 스프링이 이 값을 읽어
     * 커버를 여기에 쓴다 — 지금은 백엔드가 무시하지만, 경로를 정하는 주체가
     * 일렉트론이라는 구조는 지금 세워둔다
     */
    /*
     * 로컬 모드에는 스토리지가 아예 없다 — 명시적으로 꺼서 넘긴다.
     * 안 넘기면 스프링 기본값(false)에 기대게 되는데, **기본값에 기대는 것과
     * 값을 정해서 주는 것은 다르다** — 기본값이 바뀌면 조용히 동작이 바뀐다
     */
    env: {
      STARLOG_DATA_ROOT: dataRoot,
      STARLOG_MEDIA_USE_STORAGE_FOR_COVERS: "false",
      STARLOG_MEDIA_USE_STORAGE_FOR_SCREENSHOTS: "false",
    },
  };
}

function cloudConfig(profile) {
  const db = profile.db ?? {};
  const storage = profile.storage ?? {};
  const { dataRoot } = store.getSettings();
  /*
   * 스키마 지정은 URL 파라미터로 붙인다 (결정 60). 이게 있으면 남의 테이블과
   * 한 DB에서 공존해 DB_NOT_EMPTY가 아예 안 생긴다
   */
  const url = db.schema ? appendParam(db.url, `currentSchema=${db.schema}`) : db.url;
  return {
    mode: "cloud",
    url,
    driver: "org.postgresql.Driver",
    username: db.user,
    password: db.password,
    env: {
      STARLOG_DATA_ROOT: dataRoot,
      /*
       * 무엇을 스토리지에 올릴지 (사용자 결정 2026-08-28).
       * 체크 안 한 것은 데이터 루트에 저장된다. **자격증명이 없으면 백엔드가 무시한다** —
       * 올릴 데가 없는데 켜져 있으면 업로드가 502로 실패할 뿐이다 (MediaTargets)
       */
      STARLOG_MEDIA_USE_STORAGE_FOR_COVERS: String(!!profile.mediaTargets?.covers),
      STARLOG_MEDIA_USE_STORAGE_FOR_SCREENSHOTS: String(!!profile.mediaTargets?.screenshots),
      APP_STORAGE_ENDPOINT: storage.endpoint,
      APP_STORAGE_BUCKET: storage.bucket,
      APP_STORAGE_ACCESS_KEY: storage.accessKey,
      APP_STORAGE_SECRET_KEY: storage.secretKey,
      APP_STORAGE_PUBLIC_BASE_URL: storage.publicBaseUrl,
      APP_IGDB_CLIENT_ID: profile.igdb?.clientId,
      APP_IGDB_CLIENT_SECRET: profile.igdb?.clientSecret,
      ...(db.schema ? { SPRING_FLYWAY_SCHEMAS: db.schema } : {}),
    },
  };
}

function appendParam(url, param) {
  return url.includes("?") ? `${url}&${param}` : `${url}?${param}`;
}

// ───────────────────────── 수명 ─────────────────────────

app.whenReady().then(() => {
  /*
   * 앱데이터 폴더 이름을 바꾼 뒤 처음 뜨는 경우, 옛 폴더의 설정과 세이브파일을 옮긴다.
   * 이걸 안 하면 **앱을 켰더니 기록이 통째로 사라진 것**처럼 보인다
   */
  paths.migrateLegacyAppData();
  protocol.handle("app", serveWeb);
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", stopBackend);
process.on("exit", stopBackend);
