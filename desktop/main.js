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
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");

const paths = require("./paths");
const store = require("./settings");
const backup = require("./backup");

/**
 * 백엔드 jar와 자바는 **패키징 여부에 따라 자리가 다르다** (10단계) → `paths.js`가 정한다.
 * 상수로 굳혀두면 개발 경로에만 맞고 `.dmg`에서는 못 찾는다
 */
const JAR = paths.jarPath();
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
/**
 * 지금 띄우려는 대상 — `{ mode, target }`.
 *
 * `session`은 **성공한 뒤에야** 채워지므로 실패를 설명할 때 쓸 수가 없다. 그런데 실패하면
 * 창이 입구로 **통째로 다시 로드**되어 화면 쪽 상태(무엇을 누르셨는지)도 함께 날아간다.
 * 그래서 "손상됐으니 이 세이브파일의 백업으로 가시라"를 화면이 스스로 알 방법이 없었다.
 * 진단에 대상을 실어 보내려고 여기에 남긴다
 */
let launching = null;

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
  /*
   * ⚠️ **정적 내보내기의 RSC 페이로드가 `.txt`다** (`dashboard.txt` 등).
   *
   * Next의 라우터는 이 응답의 content-type을 확인해서 `text/x-component`나 `text/plain`이
   * 아니면 **소프트 이동을 포기하고 문서를 통째로 다시 로드한다**(MPA 폴백).
   * 여기 `.txt`가 없어서 `application/octet-stream`으로 나갔고, 그래서 입구↔앱을 오갈 때마다
   * 문서가 바뀌어 검은 화면이 번쩍이고 알림이 사라졌다 —
   * `fetch-server-response.js`의 `isFlightResponse` 판정이 그 자리다
   */
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
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
        else parseInto(resolve, reject, urlPath, body);
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
      // getJson과 같은 이유로 여기도 필요하다 — 한글 응답이 청크 경계에서 쪼개진다
      res.setEncoding("utf8");
      let text = "";
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`${urlPath} → ${res.statusCode} ${text}`));
        else if (!text) resolve(null);
        else parseInto(resolve, reject, urlPath, text);
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

/**
 * ⚠️ **`JSON.parse`를 여기로 뺀 이유 — 감싸는 Promise가 그 예외를 못 잡는다.**
 *
 * `res.on("end")` 콜백은 Promise 실행자가 끝난 **뒤에** 다음 틱에서 돈다. 거기서 던지면
 * `reject`로 가는 게 아니라 **처리되지 않은 예외**가 되어 일렉트론 메인 프로세스가 통째로
 * 죽는다 — 창이 안내도 없이 사라진다. 스프링이 200에 HTML 에러 페이지를 주는 순간이 그렇다.
 * 직접 재현했다: `SyntaxError ... at IncomingMessage.<anonymous>`, 종료코드 1
 */
function parseInto(resolve, reject, urlPath, text) {
  try {
    resolve(JSON.parse(text));
  } catch {
    reject(new Error(`${urlPath} 응답을 읽지 못했습니다 (JSON이 아닙니다)`));
  }
}

/**
 * 기동 진행 상황을 화면에 알린다.
 *
 * ⚠️ **실패에는 대상을 붙여서 보낸다.** 기동이 실패하면 창이 입구로 통째로 다시 로드되어
 * 화면 쪽 상태가 날아간다 — "무엇을 여시려다 실패했는지"를 화면이 스스로 알 방법이 없다.
 * 그 정보가 있어야 "손상됐으니 **이 세이브파일의** 백업으로 가시라"를 띄울 수 있다.
 *
 * 붙이는 걸 여기 한 곳에 둔 이유 — 실패를 알리는 자리가 둘이다(`onBackendDied`와
 * `launch`의 catch). 각자 붙이게 두면 **나중에 온 쪽이 대상 없는 payload로 덮어쓴다.**
 * 실제로 그랬고, 그래서 [백업에서 되돌리기] 버튼이 끝내 안 떴다
 */
function progress(payload) {
  const full = payload.phase === "error" ? { ...(launching ?? {}), ...payload } : payload;
  if (win && !win.isDestroyed()) win.webContents.send("launch:progress", full);
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
/**
 * 자바를 띄우는 **단 한 곳** (2026-08-28에 하나로 합쳤다).
 *
 * 예전엔 `startBackend`와 `spawnProbe`가 인자·환경변수 조립을 **두 벌** 갖고 있었고,
 * 그래서 jar 존재 검사가 한쪽에만 있었다. 갈라진 두 벌은 반드시 어긋난다.
 *
 * ## ⚠️ `error` 이벤트를 반드시 받는다
 *
 * `spawn`은 실행 파일을 못 찾으면 `'error'`를 쏘는데, **아무도 안 받으면 Node가 그걸
 * 던진다** — 일렉트론 메인 프로세스가 통째로 죽어서 창이 안내도 없이 사라진다.
 * 직접 재현했다: `Error: spawn java ENOENT / Unhandled 'error' event`, 종료코드 1.
 * PATH에 자바가 없으면 그냥 일어나는 일이고, 10단계에서 JRE를 번들해도 **경로가 틀리면
 * 똑같다.** 여기서 받아 `exit`과 같은 모양(진단 코드)으로 바꿔 흘려보낸다
 */
/**
 * 로그가 너무 커졌으면 한 번 밀어둔다.
 *
 * 기동마다 스프링 부트 로그가 통째로 쌓이는데 지우는 데가 없었다. 지금은 문제가 아니지만
 * **로그를 보라고 안내하는 화면이 여럿**이라(진단 실패, 백엔드 종료) 수백 MB짜리 파일을
 * 열게 만들면 그 안내가 무의미해진다. 한 세대만 남긴다 — 두 벌이면 충분하다
 */
const LOG_MAX_BYTES = 5 * 1024 * 1024;

function rotateLog() {
  try {
    if (fs.statSync(paths.LOG_FILE).size <= LOG_MAX_BYTES) return;
    fs.rmSync(`${paths.LOG_FILE}.1`, { force: true });
    fs.renameSync(paths.LOG_FILE, `${paths.LOG_FILE}.1`);
  } catch { /* 없으면 밀 것도 없다 */ }
}

function spawnJava(port, config) {
  rotateLog();
  const out = fs.createWriteStream(paths.LOG_FILE, { flags: "a" });
  out.write(`\n===== ${new Date().toISOString()} port=${port} mode=${config.mode} =====\n`);

  if (!fs.existsSync(JAR)) {
    out.end(`STARLOG_DIAGNOSTIC: JAR_MISSING (${JAR})\n`);
    return { proc: null, exited: Promise.resolve({ code: -1, diagnostic: "JAR_MISSING" }) };
  }

  const args = [
    "-jar", JAR,
    `--server.port=${port}`,
    "--spring.profiles.active=desktop",
    "--starlog.diagnose=true",
    /*
     * ⚠️ **부모가 죽으면 스스로 내려가라는 지시다** (`ParentWatchdog`).
     * 이게 없으면 일렉트론이 강제 종료됐을 때 자바가 고아로 살아남아 세이브파일을 쥔다 —
     * 그러면 다음 실행의 자동 백업이 **쓰는 중인 파일을 복사해** 찢어진 백업을 남긴다
     */
    "--starlog.parent-watch=true",
    `--spring.datasource.url=${config.url}`,
    `--spring.datasource.driver-class-name=${config.driver}`,
  ];

  const env = { ...process.env };
  env.SPRING_DATASOURCE_USERNAME = config.username ?? "";
  env.SPRING_DATASOURCE_PASSWORD = config.password ?? "";
  for (const [key, value] of Object.entries(config.env ?? {})) {
    if (value) env[key] = value;
  }

  /*
   * ⚠️ **stdin을 파이프로 연다.** 아무것도 안 보내지만, 우리가 죽으면 이 파이프의 쓰는 쪽이
   * 닫혀서 자바의 `read()`가 EOF를 본다 — 그게 "부모가 사라졌다"의 신호다.
   * `"ignore"`였을 때는 자바가 부모의 죽음을 알 방법이 아예 없었다
   */
  const proc = spawn(paths.javaBin(), args, { stdio: ["pipe", "pipe", "pipe"], env });

  /*
   * 진단 결과를 stdout에서 긁는다. 로그 파일로도 그대로 흘려보내므로
   * 나중에 사람이 로그만 봐도 같은 줄이 있다
   */
  let diagnostic = null;
  proc.stdout.on("data", (chunk) => {
    const found = chunk.toString().match(/STARLOG_DIAGNOSTIC:\s*([A-Z_]+)/);
    if (found) diagnostic = found[1];
  });
  proc.stdout.pipe(out);
  proc.stderr.pipe(out);

  const exited = new Promise((resolve) => {
    const finish = (result) => {
      // 로그 스트림을 닫는다 — 안 닫으면 기동·연결테스트마다 fd가 하나씩 샌다
      out.end();
      resolve(result);
    };
    proc.once("error", (e) => {
      const code = e.code === "ENOENT" ? "JAVA_NOT_FOUND" : "BACKEND_DIED";
      out.write(`STARLOG_DIAGNOSTIC: ${code} (${e.message})\n`);
      finish({ code: -1, diagnostic: diagnostic ?? code });
    });
    proc.once("exit", (code) => finish({ code, diagnostic }));
  });

  return { proc, exited };
}

function startBackend(port, config) {
  stoppingOnPurpose = false;
  const { proc, exited } = spawnJava(port, config);
  backend = proc;
  backendPort = proc ? port : null;

  const done = exited.then((result) => {
    // 그 사이에 새 백엔드가 떴으면 그건 남의 것이다 — 내가 죽었다고 남을 지우면 안 된다
    if (backend !== proc) return result;
    backend = null;
    backendPort = null;
    if (!stoppingOnPurpose) onBackendDied(result.code, result.diagnostic);
    return result;
  });

  return { exited: done };
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
  progress({
    phase: "error",
    code: diagnostic ?? "BACKEND_DIED",
    exitCode: code,
  });
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
  const { proc, exited } = spawnJava(port, config);

  let running = proc !== null;
  const done = exited.then((result) => {
    running = false;
    return result;
  });

  return {
    exited: done,
    isAlive: () => running,
    /**
     * ⚠️ **끝까지 기다린다.** 예전엔 신호만 보내고 넘어갔는데, 이제 이걸 **로컬 세이브파일을
     * 만드는 데도 쓴다** — H2가 `.mv.db` 잠금을 놓기 전에 돌아가면 사용자가 곧바로 열었을 때
     * `DB_IN_USE`다. `stopBackend`가 본 백엔드에 대해 하는 것과 같은 이유다.
     *
     * SIGKILL 타이머도 여기서 지운다. 안 지우면 이미 죽은 pid에 3초 뒤 신호를 쏜다
     */
    async stop() {
      if (!proc || !running) return;
      proc.kill("SIGTERM");
      const killer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* 이미 죽었으면 무시 */ }
      }, 3000);
      try {
        await done;
      } finally {
        clearTimeout(killer);
      }
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
    // 타이머를 지운다 — 안 지우면 5초 뒤 **이미 죽은 pid에** SIGKILL을 쏜다
    let killer = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(killer);
      resolve();
    };
    proc.once("exit", finish);
    proc.kill("SIGTERM");

    /*
     * 얌전히 안 죽으면 강제로. 그래도 H2 MVStore는 크래시에 견디게 만들어져 있다.
     *
     * ⚠️ **graceful shutdown보다 넉넉해야 한다.** 백엔드는 하던 요청을 마치는 데 최대 20초를
     * 쓰는데(`application-desktop.yml`), 5초에 SIGKILL을 쏘면 그 설정이 무의미해진다
     */
    killer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* 이미 죽었으면 무시 */ }
      killer = setTimeout(finish, 500);
    }, 25_000);
  });
}

/**
 * 입구로 되돌린다.
 *
 * ## ⚠️ 더 이상 문서를 다시 로드하지 않는다 (2026-08-28)
 *
 * 예전엔 `win.loadURL("app://starlog/")`였다. 그런데 그건 **문서를 통째로 갈아끼우는 일**이라
 * 검은 화면이 번쩍이고, 배경 연출이 처음부터 다시 시작하고, 진행 중이던 알림
 * (`lib/tasks.ts`의 모듈 스코프 상태)이 통째로 사라졌다.
 *
 * 이제 창은 **평생 `app://` 한 장**이고 입구도 그 안의 한 화면이다. 여기서 할 일은
 * "입구로 가라"고 알리는 것뿐이고, 옮기는 건 화면 쪽 라우터가 한다
 */
function loadEntry() {
  if (win && !win.isDestroyed()) win.webContents.send("go-entry");
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
  bindDevShortcuts(win.webContents);

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

  /*
   * **이 앱에서 문서를 로드하는 유일한 곳이다.** 그 뒤로는 화면 안에서 라우팅만 한다 —
   * 입구도 앱도 같은 문서라 오갈 때 검은 화면이 없고 배경도 안 끊긴다
   */
  win.loadURL("app://starlog/");
}

// ───────────────────────── IPC ─────────────────────────

/**
 * 이름 규칙은 `saveName.js`가 소유한다 (2026-08-28).
 *
 * 여기 두면 **이름을 만들어내는 `backup.js`가 그걸 못 본다** — 되돌리기가 규칙을 어긴
 * 이름을 만들어 열지도 지우지도 못하는 세이브파일이 생겼다
 */
const names = require("./saveName");
const { assertSaveName } = names;

/**
 * 새 세이브파일을 만들고 JSON을 부어넣는다.
 *
 * **두 군데가 똑같이 필요해졌다** — 클라우드를 뽑을 때와, 덮어쓰기 전에 안전망을 뜰 때.
 * 갈라두면 한쪽만 고쳐지는 건 이번 리뷰에서 이미 여러 번 겪었다.
 *
 * 빈 세이브파일에 스키마를 만드는 일은 백엔드를 한 번 띄우면 Flyway가 알아서 한다.
 * 그 백엔드는 **격리해서** 띄운다 — 창이 보고 있는 백엔드는 손대지 않는다
 */
async function pourInto(saveName, dump) {
  const dirs = dataDirs();
  const port = await freePort();
  const probe = spawnProbe(port, localConfig(saveName));
  try {
    await waitForBackend(port, 90_000, probe.isAlive);
    await postJson(port, "/api/me/import", dump);
  } catch (e) {
    await probe.stop();
    /*
     * ⚠️ **반쯤 만들어진 세이브파일을 치운다.** Flyway가 스키마까지는 만들어놨으므로
     * 파일이 남는데, 그러면 같은 이름으로 다시 시도할 수가 없다 — "이미 있습니다"만 뜬다
     */
    for (const suffix of [".mv.db", ".trace.db"]) {
      const file = path.join(dirs.saves, `${saveName}${suffix}`);
      if (fs.existsSync(file)) fs.rmSync(file, { force: true });
    }
    const result = await probe.exited;
    throw new Error(result?.diagnostic
      ? `세이브파일을 만들지 못했습니다 (${result.diagnostic})`
      : (e.message || String(e)));
  }
  // 잠금이 풀릴 때까지 기다린다 — 바로 열러 갈 수 있어야 한다
  await probe.stop();
  return saveName;
}

function dataDirs() {
  return paths.ensureDataRoot(store.getSettings().dataRoot);
}

function registerIpc() {
  /**
   * 지금 백엔드의 포트. **동기로 답한다.**
   *
   * 화면의 `apiBase`가 모듈을 불러오는 순간 주소를 정해야 하는데, 그때 비동기로 물어보면
   * **첫 요청 몇 개가 주소 없이 나간다.** 새로고침으로 앱 안의 화면이 곧바로 뜨는 경우가
   * 정확히 그렇다. 값 하나 읽는 것뿐이라 동기로 두는 값이 싸다
   */
  ipcMain.on("session:port", (event) => {
    event.returnValue = backendPort;
  });

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
    const root = path.resolve(dirs.root);
    const resolved = path.resolve(target);
    /*
     * ⚠️ **구분자까지 봐야 한다.** `startsWith(root)`만 쓰면 데이터 루트가 `~/starlog`일 때
     * **형제 폴더인 `~/starlog-비밀`도 통과한다** — 이름이 접두사로 겹칠 뿐 남의 폴더다.
     * 바로 위 `resolveWebFile`은 처음부터 `WEB + path.sep`으로 제대로 하고 있었다
     */
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
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

  /**
   * 세이브파일 이름 바꾸기 (2026-08-28).
   *
   * ## 백업 폴더가 함께 따라가야 한다
   *
   * 백업은 `backups/<세이브이름>/`에 모여 있어서, 파일만 바꾸면 **백업이 통째로 주인을 잃는다.**
   * 목록에서는 사라지는데 디스크에는 남아 있는 상태 — 되돌릴 수 있는데 되돌릴 방법이 없어진다.
   *
   * ## 왜 필요해졌나
   *
   * 되돌리기가 `내 기록 2026-08-28_041513` 같은 이름을 만든다. 추적에는 좋지만 계속 쓸
   * 이름은 아니다. 그리고 **탐색기에서 손으로 바꾸면 규칙을 어겨 열 수 없는 파일이 된다** —
   * 앱 안에 길을 내주는 게 그 사고를 막는 방법이기도 하다
   */
  ipcMain.handle("saves:rename", async (_e, from, to) => {
    const oldName = assertSaveName(from);
    const newName = assertSaveName(to);
    if (oldName === newName) return newName;

    const dirs = dataDirs();
    if (fs.existsSync(path.join(dirs.saves, `${newName}.mv.db`))) {
      throw new Error("같은 이름의 세이브파일이 이미 있습니다");
    }
    if (!fs.existsSync(path.join(dirs.saves, `${oldName}.mv.db`))) {
      throw new Error("세이브파일을 찾을 수 없습니다");
    }

    // 열고 있으면 못 바꾼다 — 윈도우는 거부하고, 맥은 바뀌되 서버가 옛 이름을 붙든다
    if (session?.mode === "local" && session.target === oldName) {
      await stopBackend();
    }

    for (const suffix of [".mv.db", ".trace.db"]) {
      const src = path.join(dirs.saves, `${oldName}${suffix}`);
      if (fs.existsSync(src)) {
        fs.renameSync(src, path.join(dirs.saves, `${newName}${suffix}`));
      }
    }

    const oldBackups = path.join(dirs.backups, oldName);
    if (fs.existsSync(oldBackups)) {
      const target = path.join(dirs.backups, newName);
      /*
       * 새 이름의 백업 폴더가 이미 있으면(전에 같은 이름을 쓴 적이 있다) 안으로 옮겨 합친다.
       * 통째로 rename하면 **있던 백업을 덮어써서 지운다**
       */
      if (fs.existsSync(target)) {
        for (const file of fs.readdirSync(oldBackups)) {
          const to2 = path.join(target, file);
          if (!fs.existsSync(to2)) fs.renameSync(path.join(oldBackups, file), to2);
        }
        fs.rmSync(oldBackups, { recursive: true, force: true });
      } else {
        fs.renameSync(oldBackups, target);
      }
    }

    // [최근 접속]이 사라진 이름을 가리키지 않게 한다
    const settings = store.getSettings();
    if (settings.lastMode === "local" && settings.lastTarget === oldName) {
      store.patchSettings({ lastTarget: newName });
    }
    return newName;
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

    /*
     * ⚠️ **[최근 접속]도 같이 지운다.** 개명(`saves:rename`)에는 있는데 여기만 빠져 있었다.
     * 지운 뒤에도 입구에 [최근 접속]이 남아서, 누르면 **없는 파일을 열려다 같은 이름으로
     * 빈 세이브를 새로 만든다** — H2는 파일이 없으면 그냥 만들기 때문이다.
     * 사용자 눈에는 "지운 세이브가 되살아났는데 안이 텅 비었다"로 보인다. 실제로 겪었다
     */
    const settings = store.getSettings();
    if (settings.lastMode === "local" && settings.lastTarget === clean) {
      store.patchSettings({ lastMode: null, lastTarget: null });
    }
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
  /**
   * @param options `{ scope }` — `"all"`(기본)이면 DB·스토리지·IGDB·번역을 다 본다.
   *                `"database"`면 **DB와 스토리지만** 본다.
   *
   * ## 왜 범위가 필요한가 (2026-08-28)
   *
   * 입구와 앱 안은 목적이 다르다. 입구는 **관문**이라 "이 연결로 들어가도 되나"를 한 번에
   * 확인해야 한다. 앱 안은 **"방금 고친 이 값이 맞나"**라서, 안 고친 것까지 부르면
   * 느릴 뿐 아니라 결과가 다시 네 줄이라 **어디가 틀렸는지 좁혀지지 않는다.**
   *
   * IGDB와 번역은 지금 백엔드에 값을 넘겨 바로 시험할 수 있어서 앱 안에서는 각자 버튼을
   * 갖는다. **DB와 스토리지는 그럴 수가 없다** — 부팅 때 조립되는 값이라 지금 백엔드로는
   * 못 시험하고 시험용을 하나 띄워야 한다. 그래서 그 둘만 여기 남는다
   */
  ipcMain.handle("connections:test", async (_e, profile, options) => {
    const scope = options?.scope ?? "all";
    /*
     * ## 스토리지만 볼 때는 **메모리 DB로 띄운다** (2026-08-28)
     *
     * 스토리지 확인은 우리 백엔드가 버킷을 눌러보는 방식이라 백엔드가 떠야 한다.
     * 그런데 그 백엔드를 **사용자의 DB로** 띄우면, DB가 틀렸을 때 스토리지는 멀쩡한데도
     * "확인 실패"가 뜬다 — 섹션을 따로 시험하는 뜻이 사라진다.
     *
     * 메모리 H2로 띄우면 DB와 완전히 무관해진다. 어차피 이 백엔드는 버킷에 한 번
     * 손을 대보고 죽는 것뿐이라 담을 데이터가 없다
     */
    const config = scope === "storage"
      ? {
          ...cloudConfig(profile),
          url: "jdbc:h2:mem:probe;DB_CLOSE_DELAY=-1;MODE=PostgreSQL",
          driver: "org.h2.Driver",
          username: "sa",
          password: "",
        }
      : cloudConfig(profile);
    const port = await freePort();
    const probe = spawnProbe(port, config);

    /*
     * ⚠️ **시험용의 생사를 넘겨야 한다.** 기본값은 전역 `backend`를 보는데 시험용은 거기 없어서,
     * 안 넘기면 즉시 "죽었다"로 판정하고 **DB가 성공한 것처럼** 보고한다
     */
    /*
     * ⚠️ **실패를 `diagnostic: null`로 접으면 안 된다** (2026-08-28).
     *
     * 예전엔 TIMEOUT만 코드로 바꾸고 나머지를 null로 뒀는데, 아래 판정이
     * `!done?.diagnostic`이라 **null = 성공**이다. 즉 시험용이 진단 코드도 못 찍고 죽으면
     * (자바가 없다, jar가 없다) **"DB는 연결됐습니다"라고 보고했다.** 이 화면에서 이미
     * 한 번 났던 실패 모양이라 같은 자리에 두 번 만들지 않는다
     */
    const done = await Promise.race([
      probe.exited,
      waitForBackend(port, 90_000, probe.isAlive)
        .then(() => ({ code: 0, diagnostic: null }))
        .catch((e) => ({ code: -1, diagnostic: e.message || "BACKEND_DIED" })),
    ]);

    /*
     * DB가 떴으면 스토리지·IGDB도 실제로 눌러본다.
     *
     * **"연결 실패" 한 줄이면 어디가 문제인지 알 수가 없다** — 사용자가 키를 안 넣고
     * 접속했다가 빈 화면만 하염없이 본 게 이 기능의 출발점이다
     */
    let storage = null;
    let igdb = null;
    let translate = null;
    if (!done?.diagnostic) {
      const hasStorage = (scope === "all" || scope === "storage")
        && profile.storage?.endpoint && profile.storage?.bucket;
      const hasIgdb = scope === "all"
        && profile.igdb?.clientId && profile.igdb?.clientSecret;
      const hasTranslate = scope === "all" && Boolean(profile.translate?.apiKey);
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
      if (hasTranslate) {
        /*
         * ⚠️ **글자를 안 쓰는 방법으로 시험한다.** 백엔드가 `languages`(지원 언어 목록)를
         * 부르는데, 값이 매겨지는 건 번역하려고 보낸 글자라 이 호출은 공짜다.
         * "ko로 번역해보기"로 시험했다면 **버튼 한 번이 곧 돈**이었을 것이다
         */
        translate = await postJson(port, "/api/system/settings/translate/test", {
          apiKey: profile.translate.apiKey,
        }).catch((e) => ({ ok: false, message: String(e.message ?? e) }));
      }
    }

    await probe.stop();

    return {
      ok: !done?.diagnostic && (igdb?.ok ?? true) && (storage?.ok ?? true)
        && (translate?.ok ?? true),
      code: done?.diagnostic ?? null,
      /*
       * 스토리지만 볼 때의 `database`는 **메모리 DB**의 결과라 사용자의 DB와 무관하다.
       * 화면이 그걸 "데이터베이스 연결됨"으로 그리면 거짓말이 되므로 null로 지운다
       */
      database: scope === "storage" ? null : { ok: !done?.diagnostic },
      storage,
      igdb,
      translate,
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
    launching = { mode: request.mode, target: request.target };
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
    /*
     * **창을 안 옮긴다.** 포트만 알려주고 화면이 스스로 `/dashboard`로 라우팅한다 —
     * 같은 문서 안의 이동이라 배경도 알림도 안 끊긴다
     */
    return { ok: true, port };
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

    const dump = await getJson(backendPort, "/api/me/export");

    /*
     * ## 🔴 지금 쓰는 백엔드를 안 건드린다 (2026-08-28 전면 수정)
     *
     * 예전엔 클라우드 백엔드를 죽이고 → 로컬을 띄워 부어넣고 → **새 포트로** 클라우드를
     * 되살렸다. 그런데 창을 옮기는 줄이 없었다. 이 기능은 앱 안(`/settings`)에서 부르므로
     * 창은 **죽은 옛 포트**를 계속 보게 되고, 뽑기가 성공한 그 순간부터 앱 전체가
     * `Failed to fetch`가 됐다. 연결 테스트에서 고쳤던 것과 똑같은 실수다.
     *
     * 죽일 이유가 애초에 없다 — 상대는 **다른 DB의 다른 포트**다. 시험용과 같은 방식으로
     * 격리해서 띄우고 내리면 창도 세션도 그대로다
     */
    await pourInto(clean, dump);
    return { saveName: clean };
  });

  /**
   * 로컬 세이브파일 → 지금 붙어 있는 데이터베이스 (2026-08-28). **덮어쓰기다.**
   *
   * ## 지우기 전에 빠져나갈 구멍을 판다
   *
   * ⚠️ 백엔드의 `/api/me/replace`는 **되돌릴 수 없다.** 그런데 클라우드에는 백업이
   * 아예 없다는 게 9단계의 전제였다 — 복사할 파일이 없어서다. 이 기능이 정확히 그
   * 구멍을 건드리므로, **덮어쓰기 직전에 대상을 로컬 세이브파일로 뽑아둔다.**
   * 그러면 "덮어썼는데 아차" 할 때 돌아갈 데가 생긴다 (사용자 승인 2026-08-28).
   *
   * ## 본 백엔드는 계속 살아 있다
   *
   * 읽어올 세이브파일은 **시험용처럼 격리해서** 잠깐 띄운다. 뽑기에서 창이 죽은 포트를
   * 보게 됐던 실수를 여기서 되풀이하지 않는다
   */
  ipcMain.handle("saveFile:toCloud", async (_e, saveName) => {
    if (session?.mode !== "cloud" || !backendPort) {
      throw new Error("데이터베이스로 접속 중일 때만 올릴 수 있습니다");
    }
    const clean = assertSaveName(saveName);
    const dirs = dataDirs();
    if (!fs.existsSync(path.join(dirs.saves, `${clean}.mv.db`))) {
      throw new Error("세이브파일을 찾을 수 없습니다");
    }

    /*
     * ① 안전망. 지금 데이터베이스에 든 것을 세이브파일 하나로 뽑아둔다.
     *    이름이 겹치면 뒤에 번호를 붙인다 — 여러 번 덮어써도 매번 남아야 한다
     */
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "").replace(/^(\d{8})/, "$1_");
    let safety = names.fit(`덮어쓰기 전 ${session.target} ${stamp}`);
    for (let i = 2; fs.existsSync(path.join(dirs.saves, `${safety}.mv.db`)); i += 1) {
      safety = names.fit(`덮어쓰기 전 ${session.target} ${stamp}`, `-${i}`);
    }
    const before = await getJson(backendPort, "/api/me/export");
    await pourInto(safety, before);

    // ② 올릴 것을 읽어온다. 세이브파일을 격리해서 잠깐 띄운다
    const port = await freePort();
    const probe = spawnProbe(port, localConfig(clean));
    let dump;
    try {
      await waitForBackend(port, 90_000, probe.isAlive);
      dump = await getJson(port, "/api/me/export");
    } finally {
      await probe.stop();
    }

    // ③ 덮어쓴다. 여기서 실패해도 ①이 남아 있다
    const result = await postJson(backendPort, "/api/me/replace", dump);

    /*
     * 창이 보고 있는 건 **덮어쓰기 전의 데이터**다. 그대로 두면 없는 항목을 눌러
     * 404를 보게 된다. 포트는 그대로라 새로고침이면 충분하다
     */
    if (win && !win.isDestroyed()) win.webContents.reload();
    return { ...result, safetySaveName: safety };
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
      return null;
    }
    // 창을 옮기지 않는다. 포트만 주면 화면이 알아서 들어간다
    return { port: backendPort };
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
      /*
       * 번역 키도 IGDB와 같은 길로 넣는다 — 여기서 넣은 건 **부팅 기본값**이고,
       * 앱 안(`app_setting`)에서 넣은 값이 있으면 그게 이긴다
       */
      TRANSLATE_API_KEY: profile.translate?.apiKey,
      ...(db.schema ? { SPRING_FLYWAY_SCHEMAS: db.schema } : {}),
    },
  };
}

function appendParam(url, param) {
  return url.includes("?") ? `${url}&${param}` : `${url}?${param}`;
}

// ───────────────────────── 수명 ─────────────────────────

/**
 * 앱을 **한 번만** 뜨게 한다 (2026-08-28).
 *
 * 두 개가 뜨면 각자 자기 백엔드를 띄우는데, 같은 세이브파일을 고르면 뒤엣것이 `DB_IN_USE`로
 * 막힌다 — 거기까지는 괜찮다. 문제는 **백업이다.** 두 번째 창의 자동 백업은 첫 번째가
 * 파일을 쥐고 있는 줄 모르고 그냥 복사해서 **찢어진 백업**을 남긴다.
 *
 * 잠금을 못 얻었다면 이미 떠 있는 것이 있다는 뜻이다. 조용히 물러나고, 원래 창을 띄워준다 —
 * 아무 반응이 없으면 사용자는 앱이 고장 난 줄 안다
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

/**
 * 윈도우의 메뉴 막대를 없앤다 (2026-08-28, 윈도우 실기 확인 뒤).
 *
 * 맥은 메뉴가 화면 위 시스템 막대에 있지만, 윈도우는 **창 안에** File/Edit/View가
 * 그려진다. 우리 화면은 자체 헤더가 있어서 그 위에 낯선 영문 메뉴가 한 줄 더 얹힌다.
 *
 * ⚠️ **맥에서는 지우면 안 된다.** 맥의 복사·붙여넣기는 메뉴의 role에 묶여 있어서
 * 메뉴를 없애면 ⌘C가 통째로 죽는다. 윈도우는 크로미움이 직접 처리하므로 안전하다
 */
if (process.platform === "win32") {
  Menu.setApplicationMenu(null);
}

/**
 * 메뉴를 없앤 대가를 갚는다 (v1.2, 사용자 제보).
 *
 * ⚠️ **윈도우에서 Ctrl+R과 Ctrl+Shift+I가 안 먹었다.** 그 단축키는 기본 메뉴의
 * 액셀러레이터라서, 메뉴를 지우면 같이 사라진다 — 맥은 시스템 메뉴가 따로 있어 멀쩡했다.
 *
 * 메뉴를 되살리는 대신 키를 직접 받는다. 메뉴 막대는 계속 없고 단축키만 산다.
 * 복사·붙여넣기는 크로미움이 직접 처리하므로 여기 없어도 된다
 */
function bindDevShortcuts(contents) {
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const mod = process.platform === "darwin" ? input.meta : input.control;
    const key = (input.key || "").toLowerCase();

    if (mod && !input.shift && key === "r") {
      contents.reload();
      event.preventDefault();
    } else if ((mod && input.shift && key === "i") || key === "f12") {
      contents.toggleDevTools();
      event.preventDefault();
    }
  });
}

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

/**
 * 나가기 전에 **자바가 정말 죽을 때까지 기다린다.**
 *
 * 예전엔 `app.on("before-quit", stopBackend)`였는데, 일렉트론은 핸들러가 돌려준 Promise를
 * 기다려주지 않는다 — 신호만 보내고 자기는 즉시 끝났다. H2가 `.mv.db` 잠금을 놓기 전에
 * 일렉트론이 사라지므로, **끄고 바로 다시 켜면 `DB_IN_USE`가 났다.** 재현이 들쭉날쭉해서
 * "가끔 안 열린다"로만 보이는 부류다.
 *
 * `preventDefault`로 종료를 한 번 막고, 다 기다린 뒤 스스로 다시 부른다.
 * `quitting` 깃발이 없으면 두 번째 `quit()`이 또 여기로 들어와 영영 못 나간다
 */
let quitting = false;
app.on("before-quit", (event) => {
  if (quitting || !backend) return;
  event.preventDefault();
  quitting = true;
  stopBackend().finally(() => app.quit());
});

/**
 * 최후 방어선. `before-quit`을 안 거치는 종료(크래시, 터미널의 Ctrl+C)에서 좀비 자바가
 * 남지 않게 한다.
 *
 * ⚠️ **`exit` 핸들러에서는 동기 코드만 돈다** — `stopBackend`의 기다리는 부분은 여기서
 * 절대 실행되지 않는다. 그래도 `kill`은 동기라 신호는 나간다. 기다리는 건 위가 맡는다
 */
process.on("exit", () => {
  if (backend) {
    try { backend.kill("SIGTERM"); } catch { /* 이미 죽었으면 무시 */ }
  }
});
