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

const ROOT = path.join(__dirname, "..");
const JAR = path.join(ROOT, "backend", "build", "libs", "app.jar");
/** 입구 화면용 정적 파일. build-desktop.sh가 jar 안과 여기 둘 다에 넣는다 */
const WEB = path.join(__dirname, "web");

let backend = null;
let backendPort = null;
let win = null;
/** 우리가 일부러 죽인 건지, 저 혼자 죽은 건지 구분한다 — 후자만 사용자에게 알린다 */
let stoppingOnPurpose = false;

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

function progress(payload) {
  if (win && !win.isDestroyed()) win.webContents.send("launch:progress", payload);
}

/**
 * 스프링이 응답할 때까지 기다린다.
 *
 * 로그의 "Started ...Application"을 보는 방법도 있지만 **문자열에 기대는 건 약하다.**
 * 실제로 HTTP가 도는지를 본다 — 무슨 상태코드든 대답하면 살아난 것이다
 */
function waitForBackend(port, timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (backend === null) return reject(new Error("BACKEND_DIED"));
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
function stopBackend() {
  if (!backend) return;
  const proc = backend;
  stoppingOnPurpose = true;
  backend = null;
  backendPort = null;
  proc.kill("SIGTERM");
  setTimeout(() => {
    try { proc.kill("SIGKILL"); } catch { /* 이미 죽었으면 무시 */ }
  }, 3000);
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

  ipcMain.handle("dialog:pickFolder", async () => {
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("shell:openFolder", (_e, which) => {
    const dirs = dataDirs();
    shell.openPath(dirs[which] ?? dirs.root);
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

  ipcMain.handle("saves:remove", (_e, name) => {
    const clean = assertSaveName(name);
    const { saves } = dataDirs();
    // .trace.db는 H2가 오류를 남기는 곁다리 파일이다. 같이 지운다
    for (const suffix of [".mv.db", ".trace.db"]) {
      const file = path.join(saves, `${clean}${suffix}`);
      if (fs.existsSync(file)) fs.rmSync(file);
    }
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
  ipcMain.handle("connections:test", async (_e, profile) => {
    const port = await freePort();
    const { exited } = startBackend(port, cloudConfig(profile));
    // 진단만 하고 죽으라는 뜻이 아니라, 정상이면 뜨므로 뜨는 걸 확인하면 곧장 내린다
    const done = await Promise.race([
      exited,
      waitForBackend(port).then(() => ({ code: 0, diagnostic: null })).catch(() => null),
    ]);
    stopBackend();
    return { ok: !done?.diagnostic, code: done?.diagnostic ?? null };
  });

  ipcMain.handle("launch", async (_e, request) => {
    const config = request.mode === "local"
      ? localConfig(assertSaveName(request.target))
      : cloudConfig(findProfile(request.target));

    progress({ phase: "starting" });
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

    store.patchSettings({ lastMode: request.mode });
    progress({ phase: "ready" });
    win.loadURL(`http://127.0.0.1:${port}/dashboard`);
    return { ok: true };
  });

  ipcMain.handle("backToEntry", () => {
    stopBackend();
    loadEntry();
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
    env: { STARLOG_DATA_ROOT: dataRoot },
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
  protocol.handle("app", serveWeb);
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", stopBackend);
process.on("exit", stopBackend);
