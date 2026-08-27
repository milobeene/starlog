/**
 * STARLOG 데스크탑 껍데기 — v1.0 1단계.
 *
 * ## 왜 백엔드를 늦게 띄우나
 *
 * 스프링은 부팅할 때 DataSource·커넥션풀·JPA 메타모델·Flyway를 한 번에 조립한다.
 * 조립이 끝난 뒤에 DB를 바꾸는 건 엔진 돌아가는 중에 엔진을 가는 것과 같다.
 * 그래서 순서를 뒤집는다 — **고르고 나서 띄운다.**
 * 스프링은 매번 "이미 정해진 DB"만 보므로 백엔드 코드가 한 줄도 안 바뀐다.
 * → docs/v1.0-architecture.md §2
 *
 * 1단계에서는 아직 입구 화면이 없어서 설정을 상수로 넘긴다.
 * **인자로 주입하는 경로 자체를 검증하는 게 목적**이고, 그 자리에 나중에 입구 화면이 들어간다.
 */
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const JAR = path.join(ROOT, "backend", "build", "libs", "app.jar");
const LOG = path.join(app.getPath("userData"), "backend.log");

/** 1단계에서는 개발과 같은 대상을 본다. 입구 화면이 생기면 여기가 사용자 선택으로 바뀐다 */
const PROFILES = "dev,local";

let backend = null;
let win = null;

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

/**
 * 스프링이 응답할 때까지 기다린다.
 *
 * 로그의 "Started ...Application"을 보는 방법도 있지만 **문자열에 기대는 건 약하다.**
 * 실제로 HTTP가 도는지를 본다 — 401이든 200이든 대답하면 살아난 것이다
 */
function waitForBackend(port, timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (backend === null) return reject(new Error("백엔드 프로세스가 먼저 종료됐습니다"));
      const req = http.get({ host: "127.0.0.1", port, path: "/api/me", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("백엔드 기동 시간 초과"));
        else setTimeout(tick, 500);
      });
      req.on("timeout", () => req.destroy());
    };
    tick();
  });
}

function startBackend(port) {
  if (!fs.existsSync(JAR)) {
    throw new Error(`jar가 없습니다: ${JAR}\ntools/build-desktop.sh 를 먼저 실행하세요`);
  }
  const out = fs.createWriteStream(LOG, { flags: "a" });
  out.write(`\n===== ${new Date().toISOString()} port=${port} =====\n`);

  // 설정을 인자로 주입한다 — 스프링은 누가 줬는지 모른다 (docs §7)
  backend = spawn("java", [
    "-jar", JAR,
    `--server.port=${port}`,
    `--spring.profiles.active=${PROFILES}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  backend.stdout.pipe(out);
  backend.stderr.pipe(out);
  backend.on("exit", (code) => {
    console.log(`[backend] exit ${code}`);
    backend = null;
  });
}

/**
 * 좀비 프로세스 방지. **윈도우에서 특히 잘 남아** 다음 실행의 포트를 문다.
 * SIGTERM으로 먼저 부탁하고, 안 죽으면 SIGKILL
 */
function stopBackend() {
  if (!backend) return;
  const proc = backend;
  backend = null;
  proc.kill("SIGTERM");
  setTimeout(() => {
    try { proc.kill("SIGKILL"); } catch { /* 이미 죽었으면 무시 */ }
  }, 3000);
}

function createWindow(port) {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    /*
     * 반응형을 폰 폭(390px)까지 넣어서 하한을 크게 낮췄다 (docs §10-7).
     * 380으로 잡은 이유 — 그 아래는 아이폰 14보다 좁아 실기기에도 없는 폭이다.
     * 1920 모니터의 좌우 반반 분할(960)도 이제 들어간다
     */
    minWidth: 380,
    minHeight: 480,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.once("ready-to-show", () => win.show());
  win.maximize();
  // 외부 링크는 앱 안이 아니라 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(async () => {
  try {
    const port = await freePort();
    startBackend(port);
    await waitForBackend(port);
    createWindow(port);
  } catch (e) {
    console.error(e);
    const { dialog } = require("electron");
    dialog.showErrorBox("STARLOG를 시작하지 못했습니다", `${e.message}\n\n로그: ${LOG}`);
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", stopBackend);
process.on("exit", stopBackend);
