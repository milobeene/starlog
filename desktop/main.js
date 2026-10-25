/**
 * STARLOG 데스크탑 — v1.0 5단계, v2에서 서버를 자바 → TS(`utilityProcess`)로.
 *
 * ## 순서가 뒤집혀 있다
 *
 * 보통은 서버를 띄우고 화면을 연다. 여기는 **화면을 먼저 열고 서버를 나중에** 띄운다.
 * 서버는 기동할 때 DB 연결·마이그레이션을 한 번에 조립한다 — 조립이 끝난 뒤 DB를 바꾸는 건
 * 엔진 돌아가는 중에 엔진을 가는 것과 같다. (자바 시절에 세운 원칙이고 v2도 그대로다)
 *
 *   1. 일렉트론이 뜬다                    ← 백엔드 없음
 *   2. 입구 화면을 app:// 로 로드          ← 순수 프론트, DB 필요 없음
 *   3. 사용자가 모드와 대상을 고른다
 *   4. 빈 포트를 찾아 서버를 띄운다        ← utilityProcess, 설정은 전부 환경변수로
 *   5. 진단 통과하면 포트를 알려주고, 화면이 같은 문서 안에서 본 앱으로 라우팅한다
 *
 * **서버는 매번 "이미 정해진 DB"만 본다 → 서버 코드는 모드를 모른다.**
 * → docs/v1.0-architecture.md §2
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session: electronSession, shell, utilityProcess } = require("electron");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");

const paths = require("./paths");
const store = require("./settings");
const backup = require("./backup");
const cloudBackup = require("./cloudBackup");
const saveFiles = require("./saveFiles");
const media = require("./media");
const csp = require("./csp");

/**
 * 서버 번들은 **패키징 여부에 따라 자리가 다르다** (10단계) → `paths.js`가 정한다.
 * 상수로 굳혀두면 개발 경로에만 맞고 `.dmg`에서는 못 찾는다
 */
const SERVER = paths.serverEntry();
/** 정적 프론트. 입구·본 앱(app://)과 서버의 http 사본이 **이 한 벌을 쓴다** */
const WEB = path.join(__dirname, "web");
/** 서버(utilityProcess)에게 줄 실제 경로. 패키징되면 asar 밖(`app.asar.unpacked`)에 있다 */
const WEB_FOR_SERVER = WEB.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);

let backend = null;
let backendPort = null;
/** 지금 백엔드가 쓰는 `<데이터 루트>/media` — 클립보드·내보내기 경로를 이 안으로 묶는다 */
let backendMediaRoot = null;
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
 * `session`은 **성공한 뒤에야** 채워지므로 실패를 설명할 때 쓸 수가 없다. 그리고 앱 안에서 서버가
 * 죽으면 화면이 입구로 라우팅되며 "무엇을 열고 있었는지"를 잃는다.
 * "손상됐으니 이 세이브파일의 백업으로 가시라"를 띄우려면 진단에 대상을 실어 보내야 한다
 */
let launching = null;
/**
 * 기동 세대. `launch`가 부를 때마다 올리고, 기다린 뒤마다 "아직 내 차례인가"를 본다 (2026-10-25).
 * 두 번 눌러 겹치면 늦은 쪽이 앞엣것을 내리는데, 앞엣것이 그걸 모르고 죽은 포트를 90초 두드리다
 * **남의 이름이 붙은 오류**를 "ready" 뒤에 쏘았다. [취소]도 이 번호를 올린다
 */
let launchSeq = 0;
/**
 * 앱 안에서 서버가 혼자 죽었을 때의 오류. 입구가 **마운트되며 가져간다** (`launch:takeError`).
 * 죽음을 알리는 순간 화면은 아직 앱이고, 입구로 라우팅된 뒤에야 구독이 붙는다 — 그 사이에 쏜 이벤트는
 * 받을 사람이 없어 이유 없는 입구만 남았다
 */
let pendingEntryError = null;
/** 지금 떠 있는 시험용 서버들 — 앱을 닫을 때 같이 내린다 (안 그러면 붓던 세이브가 반쪽으로 남는다) */
const probes = new Set();
/** 붓는 중인 세이브 이름 — 같은 이름을 두 번 붓다 서로의 폴더를 지우지 않게 */
const pouring = new Set();

/**
 * 서버 기동을 기다리는 한계. 넘기면 내리고 TIMEOUT으로 알린다 (Neon 콜드스타트 + 마이그레이션).
 * 환경변수는 데스크탑 E2E가 90초를 기다리지 않으려고 줄이는 데만 쓴다 — 늘리는 건 막는다
 */
const LAUNCH_TIMEOUT_MS = Math.min(Number(process.env.STARLOG_LAUNCH_TIMEOUT_MS) || 90_000, 90_000);
/**
 * 정상 종료를 기다리는 한계 — 본 서버와 시험용이 **같은 값**이다 (2026-10-25).
 * 시험용만 3초였는데, 그건 방금 부은 세이브를 닫는 서버이기도 해서 느린 디스크면 갓 만든 세이브를 강제로 죽였다
 */
const STOP_TIMEOUT_MS = 25_000;

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
 * 정적 내보내기의 파일 모양에 맞춰 이어 붙인다 — 서버의 `http/static.ts`와 같은 규칙이다.
 * `/` → `index.html`, `/dashboard` → `dashboard.html`.
 *
 * 두 곳에 같은 규칙이 있는 게 중복처럼 보이지만, **입구는 서버가 뜨기 전에 떠야 해서**
 * 서버의 것을 쓸 수가 없다
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

/** 지금 백엔드가 붙은 스토리지 출처 — 연결 설정을 그 뒤에 고쳤어도 떠 있는 서버는 옛 주소를 쓴다 */
let backendStorage = { img: [], connect: [] };
/** 창의 문서가 받은 CSP에 들어간 스토리지 출처. 기동·복귀 때 모자라면 `reload`를 실어 보낸다 */
let documentStorage = { img: [], connect: [] };

function serveWeb(request) {
  const file = resolveWebFile(new URL(request.url).pathname);
  if (!file) {
    return new Response("Not Found", { status: 404 });
  }
  const body = fs.readFileSync(file);
  const headers = { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" };
  if (path.extname(file) === ".html") {
    const saved = csp.storageOrigins(store.storageUrls());
    const storage = {
      img: [...new Set([...saved.img, ...backendStorage.img])],
      connect: [...new Set([...saved.connect, ...backendStorage.connect])],
    };
    // HTML은 문서로만 받는다(Next의 소프트 이동은 .txt) — 받은 게 곧 창이 쥔 정책이다
    documentStorage = storage;
    headers["content-security-policy"] = csp.buildCsp({
      scriptHashes: csp.inlineScriptHashes(body.toString("utf8")),
      imgOrigins: storage.img,
      connectOrigins: storage.connect,
    });
  }
  return new Response(body, { headers });
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

/**
 * 서버마다 새로 뽑는 API 토큰 — `포트 → 토큰`. 서버는 이게 없는 `/api` 요청을 거절한다 (보안 점검 2026-10-25).
 * 같은 컴퓨터의 다른 프로그램(브라우저 탭 포함)이 127.0.0.1 포트를 찔러 내 기록을 읽지 못하게 하는 장치다.
 * 메인이 직접 부르는 요청(경로 묻기·내보내기·연결 테스트)도 전부 이걸 단다
 */
const tokens = new Map();

function authHeaders(port) {
  const token = tokens.get(port);
  return token ? { "X-Starlog-Token": token } : {};
}

/** 우리 백엔드에 JSON을 묻는다. 작은 요청뿐이라 스트리밍은 필요 없다 */
function getJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: urlPath, headers: authHeaders(port) }, (res) => {
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
      headers: { "Content-Type": "application/json", "Content-Length": body.length, ...authHeaders(port) },
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
 * 죽는다 — 창이 안내도 없이 사라진다. 서버가 200에 JSON 아닌 것을 주는 순간이 그렇다.
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
 * ⚠️ **실패에는 대상을 붙여서 보낸다.** 앱 안에서 서버가 죽으면 화면이 입구로 옮겨 가며
 * "무엇을 열고 있었는지"를 모른다. 그 정보가 있어야 "손상됐으니 **이 세이브파일의** 백업으로
 * 가시라"를 띄울 수 있다.
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
 * 서버가 응답할 때까지 기다린다. 로그 문자열이 아니라 **실제로 HTTP가 도는지**를 본다 —
 * 무슨 상태코드든 대답하면 살아난 것이다.
 *
 * @param isAlive **그 프로세스가** 아직 살아 있나 — 기본값을 두지 않는다 (2026-10-25).
 *                전역 `backend`를 보면 시험용(전역에 없음)은 즉시 "죽음"이 되고, 겹친 기동에서는
 *                남의 서버가 살아 있는 걸 내 서버로 착각해 죽은 포트를 90초 두드렸다
 */
function waitForBackend(port, timeoutMs, isAlive) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (!isAlive()) return reject(new Error("BACKEND_DIED"));
      const req = http.get({ host: "127.0.0.1", port, path: "/api/me", timeout: 2000, headers: authHeaders(port) }, (res) => {
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
 * 로그가 너무 커졌으면 한 번 밀어둔다.
 *
 * 기동마다 서버 로그가 쌓이는데 지우는 데가 없었다. **로그를 보라고 안내하는 화면이 여럿**이라
 * (진단 실패, 백엔드 종료) 수백 MB짜리 파일을 열게 만들면 그 안내가 무의미해진다.
 * 한 세대만 남긴다 — 두 벌이면 충분하다
 */
const LOG_MAX_BYTES = 5 * 1024 * 1024;

function rotateLog() {
  try {
    if (fs.statSync(paths.LOG_FILE).size <= LOG_MAX_BYTES) return;
    fs.rmSync(`${paths.LOG_FILE}.1`, { force: true });
    fs.renameSync(paths.LOG_FILE, `${paths.LOG_FILE}.1`);
  } catch { /* 없으면 밀 것도 없다 */ }
}

/**
 * 로그는 **스트림 하나**를 모든 서버(본·시험용)가 함께 쓴다 — 크기를 세어 돌리는 중에도 민다.
 * 기동 때만 밀면 오래 켜 둔 세션 하나가 수백 MB를 쌓는다.
 * 0600 — 서버 로그에는 경로·게임 이름·오류 원문이 들어간다
 */
let logStream = null;
let logBytes = 0;

function logWrite(chunk) {
  if (!logStream) {
    fs.mkdirSync(path.dirname(paths.LOG_FILE), { recursive: true });
    rotateLog();
    logStream = fs.createWriteStream(paths.LOG_FILE, { flags: "a", mode: 0o600 });
    logStream.on("error", () => { /* 로그를 못 쓴다고 앱을 죽이지 않는다 */ });
    // 0644로 만들어져 있던 옛 파일까지 맞춘다
    try { fs.chmodSync(paths.LOG_FILE, 0o600); } catch { /* 윈도우는 의미가 없다 */ }
    try { logBytes = fs.statSync(paths.LOG_FILE).size; } catch { logBytes = 0; }
  }
  logStream.write(chunk);
  logBytes += Buffer.byteLength(chunk);
  if (logBytes > LOG_MAX_BYTES) {
    const full = logStream;
    logStream = null;
    full.end();
    /*
     * 닫히기를 안 기다리고 바로 민다 — 유닉스는 열린 파일도 이름을 바꿀 수 있고 남은 쓰기는 옮긴 쪽으로 간다.
     * 윈도우는 rename이 실패하므로 다음 열 때 `rotateLog`가 다시 해본다
     */
    try {
      fs.rmSync(`${paths.LOG_FILE}.1`, { force: true });
      fs.renameSync(paths.LOG_FILE, `${paths.LOG_FILE}.1`);
    } catch { /* 다음에 */ }
  }
}

/**
 * 서버에 넘길 환경변수 — **허용 목록**에서만 고른다 (보안 점검 2026-10-25).
 *
 * 예전엔 `...process.env`였다. 사용자 셸에 `STARLOG_PROFILE=dev`가 남아 있으면 배포판 서버가
 * 개발 모드(인증 장치 `X-Member-Id`, CORS 꺼짐)로 떴다. 서버가 실제로 필요로 하는 건
 * 경로·임시 폴더·로캘·인증서 정도다.
 *
 * 프록시 변수(`HTTPS_PROXY` 등)는 뺐다 — 서버의 fetch·`pg` 어느 쪽도 그걸 읽지 않아서
 * "회사망 지원"처럼 보이기만 했다. 필요해지면 서버가 프록시 에이전트를 붙이는 쪽이 먼저다
 */
const ENV_PASSTHROUGH = [
  "PATH", "HOME", "TMPDIR", "TMP", "TEMP", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "LC_CTYPE", "TZ",
  "XDG_RUNTIME_DIR",
  // 윈도우 — 없으면 Node가 임시 폴더·홈·시스템 DLL을 못 찾는다
  "SystemRoot", "SYSTEMROOT", "windir", "ComSpec", "PATHEXT", "APPDATA", "LOCALAPPDATA", "USERPROFILE",
  "HOMEDRIVE", "HOMEPATH", "USERNAME", "ProgramData", "ProgramFiles", "ProgramFiles(x86)", "CommonProgramFiles",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
  // 사설 인증서 — 회사망 TLS 검사 장비 뒤에서는 이게 없으면 Neon·R2·IGDB에 못 붙는다
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
];
/** 사용자 환경에서 절대 넘기면 안 되는 것 — 허용 목록에 실수로 들어가도 여기서 한 번 더 지운다 */
const ENV_FORBIDDEN = ["STARLOG_PROFILE", "STARLOG_THUMBNAILER", "STARLOG_API_TOKEN", "NODE_OPTIONS", "ELECTRON_RUN_AS_NODE"];

/**
 * 서버를 띄우는 **단 한 곳** (2026-08-28에 하나로 합쳤다). 본 서버·시험용 모두 여기를 지난다 —
 * 조립이 두 벌이면 실행 파일 존재 검사 같은 게 한쪽에만 생긴다.
 *
 * 설정은 전부 **환경변수**로 넘긴다 — 인자는 `ps`로 같은 계정의 다른 프로세스에 보인다 (`server/src/config.ts`).
 *
 * ⚠️ `kill("SIGTERM")`은 신호가 아니라 **메시지로 종료를 요청한다.** 윈도우에서
 * `utilityProcess.kill()`은 TerminateProcess(강제)라 PGlite가 닫힐 틈이 없다 —
 * 강제로 죽은 데이터 폴더는 망가질 수 있다. 강제는 `kill("SIGKILL")`일 때만
 *
 * `exited`는 `{ code, diagnostic, checked }`다. `checked`는 점검 전용 기동(`STARLOG_CHECK_ONLY`)이
 * DB를 열어 보고 곱게 내려갔다는 신호다
 */
function spawnServer(port, config) {
  logWrite(`\n===== ${new Date().toISOString()} port=${port} mode=${config.mode} =====\n`);

  if (!fs.existsSync(SERVER)) {
    logWrite(`STARLOG_DIAGNOSTIC: SERVER_MISSING (${SERVER})\n`);
    return { proc: null, exited: Promise.resolve({ code: -1, diagnostic: "SERVER_MISSING" }) };
  }

  const env = {};
  for (const key of ENV_PASSTHROUGH) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, {
    STARLOG_PORT: String(port),
    STARLOG_HOST: "127.0.0.1",
    STARLOG_STATIC_DIR: WEB_FOR_SERVER,
  });
  for (const [key, value] of Object.entries(config.env ?? {})) {
    if (value) env[key] = value;
  }
  for (const key of ENV_FORBIDDEN) delete env[key];
  const token = crypto.randomBytes(32).toString("base64url");
  env.STARLOG_API_TOKEN = token;
  tokens.set(port, token);

  let child;
  try {
    child = utilityProcess.fork(SERVER, [], { env, stdio: "pipe", serviceName: "STARLOG 서버" });
  } catch (e) {
    tokens.delete(port);
    logWrite(`STARLOG_DIAGNOSTIC: BACKEND_DIED (${e.message})\n`);
    return { proc: null, exited: Promise.resolve({ code: -1, diagnostic: "BACKEND_DIED" }) };
  }

  let diagnostic = null;
  let checked = false;
  /*
   * 썸네일은 서버가 부탁하고 여기서 만든다 (`nativeImage`가 메인 전용). 경로는 **이 서버에 준 데이터 루트**
   * 안으로 묶는다 — 설정의 데이터 루트가 그사이 바뀌어도 이 서버가 보는 곳은 그대로다
   */
  const mediaRoot = config.env?.STARLOG_DATA_ROOT ? path.join(config.env.STARLOG_DATA_ROOT, "media") : null;
  // 진단은 두 길로 온다 — 메시지(정상)와 stdout 한 줄(메시지가 가기 전에 죽었을 때)
  child.on("message", (m) => {
    if (m && m.type === "diagnostic") diagnostic = m.code;
    else if (m && m.type === "checked") checked = true;
    else media.handleServerMessage(m, mediaRoot, (reply) => child.postMessage(reply));
  });
  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    const found = text.match(/STARLOG_DIAGNOSTIC:\s*([A-Z_]+)/);
    if (found) diagnostic = found[1];
    if (/STARLOG_CHECKED\b/.test(text)) checked = true;
    logWrite(chunk);
  });
  child.stderr?.on("data", (chunk) => logWrite(chunk));

  const exited = new Promise((resolve) => {
    child.once("exit", (code) => {
      // 같은 포트를 다음 서버가 받을 수 있다 — 내 토큰일 때만 지운다
      if (tokens.get(port) === token) tokens.delete(port);
      resolve({ code, diagnostic, checked });
    });
  });

  const proc = {
    pid: child.pid,
    kill(signal) {
      if (signal === "SIGKILL") {
        try { process.kill(child.pid, "SIGKILL"); } catch { try { child.kill(); } catch { /* 이미 없다 */ } }
        return true;
      }
      try { child.postMessage({ type: "shutdown" }); } catch { /* 이미 내려가는 중 */ }
      return true;
    },
    once(event, fn) {
      if (event === "exit") exited.then((r) => fn(r.code));
      return proc;
    },
  };
  return { proc, exited };
}

function startBackend(port, config) {
  stoppingOnPurpose = false;
  const { proc, exited } = spawnServer(port, config);
  backend = proc;
  backendPort = proc ? port : null;
  backendMediaRoot = proc && config.env?.STARLOG_DATA_ROOT ? path.join(config.env.STARLOG_DATA_ROOT, "media") : null;
  // 띄우지도 못했으면(번들 없음) 죽음을 따로 알리지 않는다 — `launch`가 그 진단으로 바로 답한다
  if (!proc) return { proc, exited };

  const done = exited.then((result) => {
    // 그 사이에 새 백엔드가 떴으면 그건 남의 것이다 — 내가 죽었다고 남을 지우면 안 된다
    if (backend !== proc) return result;
    backend = null;
    backendPort = null;
    backendMediaRoot = null;
    if (!stoppingOnPurpose) {
      const lost = session;
      session = null;
      onBackendDied(result.code, result.diagnostic, lost);
    }
    return result;
  });

  return { proc, exited: done };
}

/**
 * 백엔드가 저 혼자 죽었다 (architecture §2 "딸려오는 자잘한 일" 5번).
 *
 * 이걸 안 잡으면 화면이 그대로 남은 채 모든 요청이 실패해서
 * **앱이 고장 난 게 아니라 데이터가 사라진 것처럼 보인다.** 입구로 되돌린다.
 *
 * 오류는 `pendingEntryError`에도 남긴다 — 지금 쏘는 이벤트는 아직 앱 화면이 받고(입구 구독이 없다),
 * 입구는 라우팅이 끝나고 마운트되며 이걸 가져간다
 */
function onBackendDied(code, diagnostic, lost) {
  if (!win || win.isDestroyed()) return;
  const payload = {
    ...(lost ?? launching ?? {}),
    phase: "error",
    code: diagnostic ?? "BACKEND_DIED",
    exitCode: code,
  };
  pendingEntryError = payload;
  loadEntry();
  progress(payload);
}

/**
 * 시험용 백엔드 (2026-08-28).
 *
 * **본 백엔드(`backend`)와 완전히 따로 논다.** 전역 상태를 안 건드리는 게 요점이다 —
 * 예전엔 연결 테스트가 본 백엔드를 죽였다 되살렸고, 그때 **포트가 바뀌어서** 창이
 * 옛 포트를 보며 `Failed to fetch`를 뱉었다.
 *
 * 죽음 감지(`onBackendDied`)도 안 붙인다. 시험용은 끝나면 죽는 게 정상이라
 * 붙이면 매번 "서버가 예기치 않게 종료됐습니다"가 뜬다. 대신 `probes`에 올려 앱 종료 때 함께 내린다
 */
function spawnProbe(port, config) {
  const { proc, exited } = spawnServer(port, config);

  let running = proc !== null;
  const done = exited.then((result) => {
    running = false;
    probes.delete(probe);
    return result;
  });

  const probe = {
    exited: done,
    isAlive: () => running,
    /**
     * ⚠️ **끝까지 기다린다.** 이걸 **로컬 세이브파일을 만드는 데도 쓴다** — 서버가 세이브파일
     * 잠금을 놓기 전에 돌아가면 사용자가 곧바로 열었을 때 `DB_IN_USE`다.
     * `stopBackend`가 본 백엔드에 대해 하는 것과 같은 이유고, 기다리는 시간도 같다.
     *
     * SIGKILL 타이머도 여기서 지운다. 안 지우면 이미 죽은 pid에 신호를 쏜다
     */
    async stop() {
      if (!proc || !running) return;
      proc.kill("SIGTERM");
      const killer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* 이미 죽었으면 무시 */ }
      }, STOP_TIMEOUT_MS);
      try {
        await done;
      } finally {
        clearTimeout(killer);
      }
    },
  };
  if (running) probes.add(probe);
  return probe;
}

/**
 * 시험용이 뜰 때까지 기다린 결과 — `{ ready }` 또는 `{ ready: false, code }`.
 *
 * ⚠️ **진단 없이 죽은 것도 실패다** (2026-10-25). 예전엔 `probe.exited`가 먼저 이기면
 * `{diagnostic: null}`이 되고 판정이 `!diagnostic`이라 **"DB 연결됨"**으로 보고했다 —
 * 부팅 중 처리 안 된 거부·번들 로드 실패·메모리 부족이 다 성공으로 보였다
 */
async function settleProbe(probe, port, { checkOnly = false } = {}) {
  const outcome = await Promise.race([
    probe.exited.then((r) => ({ exit: r })),
    waitForBackend(port, LAUNCH_TIMEOUT_MS, probe.isAlive).then(() => ({ ready: true }), (e) => ({ failed: e.message })),
  ]);
  if (outcome.ready) return { ready: true };
  if (outcome.failed === "TIMEOUT") return { ready: false, code: "TIMEOUT" };
  const r = outcome.exit ?? await probe.exited;
  // 점검 전용은 DB를 열어 보고 스스로 내려가는 게 성공이다
  if (checkOnly && r.checked && r.code === 0 && !r.diagnostic) return { ready: true, checked: true };
  return { ready: false, code: r.diagnostic ?? "BACKEND_DIED" };
}

/**
 * 백엔드를 내리고 **완전히 죽을 때까지 기다린다.**
 *
 * ⚠️ **기다리는 게 요점이다.** 신호만 보내고 넘어가면 서버가 아직 세이브파일(PGlite 폴더)을 쥔 채인데
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
  backendMediaRoot = null;
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
     * 얌전히 안 죽으면 강제로. PGlite는 Postgres라 WAL로 크래시를 견디지만,
     * 강제 종료는 **마지막 수단**이다 — 정상 종료(메시지)가 데이터 폴더를 닫을 시간을 넉넉히 준다.
     *
     * ⚠️ **서버가 하던 요청을 마칠 시간보다 넉넉해야 한다.** 5초에 SIGKILL을 쏘면
     * 업로드 중인 요청이 잘리고 PGlite가 닫히지 못한다
     */
    killer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* 이미 죽었으면 무시 */ }
      killer = setTimeout(finish, 500);
    }, STOP_TIMEOUT_MS);
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

// ───────────────────────── 창 잠금 (보안 점검 2026-10-25) ─────────────────────────

/**
 * 창이 머물 수 있는 곳 — 우리 문서(`app://starlog`)와 **지금 서버**(`http://127.0.0.1:<포트>`)뿐.
 *
 * 창에는 preload 다리(`window.starlog`)가 붙는다. 메모의 링크 하나로 창이 남의 페이지로 넘어가면
 * 그 페이지가 다리로 연결 설정·세이브파일을 만질 수 있었다 (실제로 재현했다). 포트까지 보는 이유 —
 * 127.0.0.1의 다른 포트는 남의 프로그램일 수 있다
 */
function isAppUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol === "app:") return url.host === "starlog";
    return url.protocol === "http:" && url.hostname === "127.0.0.1"
      && backendPort !== null && url.port === String(backendPort);
  } catch {
    return false;
  }
}

/** 기본 브라우저로 넘겨도 되는 주소. `file:`·`smb:`·앱 스킴은 OS가 실행 파일을 띄울 수 있다 */
function externalUrl(raw) {
  try {
    const url = new URL(raw);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function lockNavigation(contents) {
  /*
   * 링크 클릭·`location =`·파일 끌어놓기(→ file://)가 전부 여기로 온다.
   * 밖으로 가려던 http(s)는 기본 브라우저로 보내준다 — 막기만 하면 링크가 "안 눌리는" 걸로 보인다
   */
  contents.on("will-frame-navigate", (event) => {
    if (isAppUrl(event.url) || (!event.isMainFrame && event.url === "about:blank")) return;
    event.preventDefault();
    const external = externalUrl(event.url);
    if (external && event.isMainFrame) shell.openExternal(external);
  });
  /*
   * 하위 프레임·리다이렉트도 같은 규칙. 이 앱은 iframe을 안 쓴다 — about:blank만 둔다.
   * `will-navigate`는 위가 먼저 막으면 오지 않지만, 순서가 바뀌는 판을 대비해 막기만 한 번 더
   */
  contents.on("will-navigate", (event) => {
    if (!isAppUrl(event.url)) event.preventDefault();
  });
  contents.on("will-redirect", (event) => {
    if (!isAppUrl(event.url)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  /*
   * 새 창은 절대 안 연다. `target=_blank` 링크는 여기서 기본 브라우저로 —
   * ⚠️ 주소를 거르지 않고 `openExternal`에 넘기면 `smb://`·`file://`가 OS 핸들러로 실행된다
   */
  contents.setWindowOpenHandler(({ url }) => {
    const external = externalUrl(url);
    if (external) shell.openExternal(external);
    return { action: "deny" };
  });
}

/**
 * 이 앱이 쓰는 권한만 연다. 나머지(카메라·마이크·위치·알림·클립보드 읽기 …)는 묻지도 않고 거절한다.
 * - fullscreen: 영상 플레이어의 전체 화면 버튼
 * - clipboard-sanitized-write: 글자 복사 (그림·파일 복사는 메인이 한다)
 * - local-network-access·loopback-network·local-network: `app://` 문서가 127.0.0.1 서버를 부른다 —
 *   크로미움의 "로컬 네트워크 접근" 확인이 이걸로 묻는다
 */
const ALLOWED_PERMISSIONS = new Set([
  "fullscreen", "clipboard-sanitized-write", "local-network-access", "loopback-network", "local-network",
]);

function lockPermissions() {
  const ses = electronSession.defaultSession;
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const from = details?.requestingUrl ?? contents?.getURL?.() ?? "";
    callback(ALLOWED_PERMISSIONS.has(permission) && win !== null && contents === win.webContents && isAppUrl(from));
  });
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingOrigin));
  ses.setDevicePermissionHandler(() => false);
}

/** 우리 창이 아닌 웹 콘텐츠(혹시 생기면)는 어디로도 못 가고 아무것도 못 연다 */
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

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
      /*
       * 기본값도 true지만 박아 둔다 — preload가 Node를 못 쓰는 상태가 전제다(`electron`만 require).
       * 누가 preload에 `require("fs")`를 넣으려고 sandbox를 끄면 화면 쪽 방어가 한 겹 사라진다
       */
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.once("ready-to-show", () => win.show());
  if (saved.maximized) win.maximize();

  bindDevShortcuts(win.webContents);
  lockNavigation(win.webContents);

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
 * 붓기 전에 이름을 잡는다. 이미 있거나 **지금 붓는 중**이면 거절한다 (2026-10-25).
 * `taken`만 보면 두 번 누른 뽑기가 둘 다 통과하고, 늦은 쪽이 `DB_IN_USE`로 실패하며
 * 앞엣것이 쓰는 폴더를 지웠다
 */
function reserveSave(dirs, name) {
  if (pouring.has(name) || saveFiles.taken(dirs, name)) {
    throw new Error("같은 이름의 세이브파일이 이미 있습니다");
  }
  pouring.add(name);
}

/**
 * 새 세이브파일을 만들고 JSON을 부어넣는다. 이름은 `reserveSave`로 잡아 둔 것이어야 한다.
 *
 * **두 군데가 똑같이 필요하다** — 클라우드를 뽑을 때와, 덮어쓰기 전에 안전망을 뜰 때.
 *
 * 빈 세이브파일에 스키마를 만드는 일은 서버를 한 번 띄우면 마이그레이션이 알아서 한다.
 * 그 서버는 **격리해서** 띄운다 — 창이 보고 있는 백엔드는 손대지 않는다.
 *
 * ⚠️ 붓는 동안은 `<이름>.partial` 표시를 둔다. 앱이 도중에 꺼지면 반쯤 부은 폴더가 남는데,
 * 표시가 있으면 목록에 안 뜨고 다음 기동 때 치워진다
 */
async function pourInto(saveName, dump) {
  const dirs = dataDirs();
  saveFiles.markPartial(dirs, saveName);
  try {
    const port = await freePort();
    const probe = spawnProbe(port, localConfig(saveName));
    try {
      const up = await settleProbe(probe, port);
      if (!up.ready) throw new Error(`세이브파일을 만들지 못했습니다 (${up.code})`);
      await postJson(port, "/api/me/import", dump);
    } catch (e) {
      await probe.stop();
      // 반쯤 만들어진 세이브파일을 치운다 — 남기면 같은 이름으로 다시 시도할 수가 없다
      saveFiles.remove(dirs, saveName);
      throw e;
    }
    // 잠금이 풀릴 때까지 기다린다 — 바로 열러 갈 수 있어야 한다
    await probe.stop();
    saveFiles.clearPartial(dirs, saveName);
    return saveName;
  } finally {
    pouring.delete(saveName);
  }
}

function dataDirs() {
  return paths.ensureDataRoot(store.getSettings().dataRoot);
}

// ───────────────────────── 클라우드 백업 (2026-10-25) ─────────────────────────

/**
 * 종류별 마지막 상태 — `{ seq, kind, phase, target, fileName?, autoCount?, keepAuto, message? }`.
 *
 * 이벤트만 쏘면 **받을 사람이 없을 때가 있다** — 자동 백업은 ready 직후에 시작하는데 그때 화면은 아직
 * 입구에서 본 앱으로 넘어가는 중이고(CSP 때문에 문서를 새로 받기도 한다), 구독은 그 뒤에 붙는다.
 * 그래서 메인이 마지막 상태를 들고 있고 화면은 붙을 때 한 번 가져간다 (`seq`로 본 것을 거른다)
 */
const cloudBackupStatus = { auto: null, manual: null };
let cloudBackupSeq = 0;
/** 지금 자동 백업 중인 연결 — 들락거리며 두 번 기동해도 같은 날 두 장 안 생기게 */
const autoBackupRunning = new Set();

function setCloudBackupStatus(status) {
  const full = { ...status, seq: ++cloudBackupSeq, keepAuto: cloudBackup.KEEP_AUTO };
  cloudBackupStatus[status.kind] = full;
  if (win && !win.isDestroyed()) win.webContents.send("cloud-backup:status", full);
  return full;
}

/**
 * 지금 서버에서 내보내기를 받아 백업 한 장을 쓴다.
 *
 * ⚠️ **시작한 순간의 서버를 붙든다** — 포트와 토큰. 받는 사이 다른 연결로 들어갔으면 쓰지 않는다
 * (그 연결의 폴더에 남의 데이터가 들어갈 수 있다). 토큰까지 보는 이유 — 포트는 재사용될 수 있다
 */
async function runCloudBackup(kind, fileName) {
  if (!session || !backendPort) throw new Error("서버가 떠 있지 않습니다");
  const port = backendPort;
  const token = tokens.get(port);
  const target = session.target;
  const dirs = dataDirs();
  const sameServer = () => backendPort === port && tokens.get(port) === token;
  setCloudBackupStatus({ kind, phase: "running", target });
  try {
    const dump = await getJson(port, "/api/me/export");
    if (!sameServer()) throw new Error("접속이 바뀌어 백업하지 않았습니다");
    const made = kind === "auto"
      ? await cloudBackup.writeAuto(dirs, target, dump)
      : await cloudBackup.write(dirs, target, "manual", fileName, dump);
    const status = setCloudBackupStatus({ kind, phase: "done", target, ...made });
    return status;
  } catch (e) {
    setCloudBackupStatus({ kind, phase: "failed", target, message: String(e?.message ?? e) });
    throw e;
  }
}

/**
 * 클라우드로 들어가 서버가 뜨면 하루 한 번 (자동). **기다리지 않는다** — 화면은 바로 쓸 수 있어야 한다.
 * `STARLOG_E2E_CLOUD_BACKUP_LOCAL`은 E2E 전용 — 진짜 Neon 없이 로컬 세션으로 이 길을 밟는다
 */
function maybeAutoCloudBackup(mode, target) {
  if (mode !== "cloud" && process.env.STARLOG_E2E_CLOUD_BACKUP_LOCAL !== "1") return;
  if (autoBackupRunning.has(target)) return;
  let today;
  try {
    today = cloudBackup.hasAutoToday(dataDirs(), target);
  } catch (e) {
    console.error("[cloud-backup] 자동 백업 확인 실패", e);
    return;
  }
  if (today) {
    setCloudBackupStatus({ kind: "auto", phase: "skipped", target });
    return;
  }
  autoBackupRunning.add(target);
  runCloudBackup("auto")
    .catch((e) => console.error("[cloud-backup] 자동 백업 실패", e?.message ?? e))
    .finally(() => autoBackupRunning.delete(target));
}

/** 마지막으로 [폴더 고르기]에서 고른 경로. 데이터 루트로 받아주는 유일한 새 값이다 */
let pickedFolder = null;

/**
 * 데이터 루트로 쓰면 안 되는 곳. 데이터 루트는 `openPath`·백업·세이브의 울타리라,
 * 홈이나 시스템 폴더가 되면 울타리가 사라진다
 */
function unsafeDataRoot(resolved) {
  const home = path.resolve(os.homedir());
  const appData = path.resolve(paths.APP_DATA);
  const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
  if (resolved === path.parse(resolved).root) return "드라이브 맨 위는 쓸 수 없습니다";
  if (inside(home, resolved)) return "홈 폴더 자체(또는 그 위)는 쓸 수 없습니다 — 안에 폴더를 하나 만들어 골라 주세요";
  if (inside(appData, resolved)) return "앱 폴더 자체(또는 그 위)는 쓸 수 없습니다";
  const system = process.platform === "win32"
    ? [process.env.SystemRoot, process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.ProgramData]
    : ["/System", "/Library", "/Applications", "/usr", "/bin", "/sbin", "/etc", "/dev", "/cores",
        "/private/etc", "/private/var/db", path.join(home, "Library")];
  for (const dir of system.filter(Boolean).map((d) => path.resolve(d))) {
    // 기본 데이터 루트(앱데이터 안)는 ~/Library 아래라 거기만 빼준다
    if (inside(resolved, dir) && !inside(resolved, appData)) return "시스템 폴더에는 둘 수 없습니다";
  }
  if (process.platform !== "win32" && ["/private", "/var", "/tmp", "/Volumes", "/Users", "/home"].includes(resolved)) {
    return "시스템 폴더에는 둘 수 없습니다";
  }
  return null;
}

function inspectDataRoot(dir) {
  const target = String(dir ?? "").trim();
  if (!target) {
    return { ok: false, reason: "경로를 입력해 주세요" };
  }
  if (!path.isAbsolute(target)) {
    return { ok: false, reason: "전체 경로를 입력해 주세요 (/ 로 시작)" };
  }

  const resolved = path.resolve(target);
  const unsafe = unsafeDataRoot(resolved);
  if (unsafe) return { ok: false, reason: unsafe };
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
  if (exists && !fs.statSync(resolved).isDirectory()) {
    return { ok: false, reason: "폴더가 아니라 파일입니다" };
  }
  const dirs = ["saves", "backups", "covers", "media"];
  const ready = exists && dirs.every((d) => fs.existsSync(path.join(resolved, d)));
  const saveCount = ready
    ? saveFiles.list(paths.subPaths(resolved)).length
    : 0;

  return { ok: true, path: resolved, exists, ready, saveCount };
}

/** 맥의 앱·설치 묶음은 폴더처럼 생겼지만 `openPath`가 **실행한다** */
function isBundle(dir) {
  if (/\.(app|bundle|framework|plugin|kext|pkg|mpkg|prefPane|saver|appex|xpc|workflow|action|qlgenerator|mdimporter)$/i.test(dir)) {
    return true;
  }
  return process.platform === "darwin" && fs.existsSync(path.join(dir, "Contents", "Info.plist"));
}

/** 백업 파일 이름 — 경로 조각 없이 `.tar.gz`만 */
function assertBackupName(fileName) {
  if (typeof fileName !== "string" || fileName !== path.basename(fileName) || fileName.includes("\0")
    || fileName.includes("/") || fileName.includes("\\") || !/^[^.].*\.tar\.gz$/.test(fileName)) {
    throw new Error("잘못된 백업 파일입니다");
  }
  return fileName;
}

/**
 * 파일을 꺼내 가는 IPC는 **우리 창의 최상위 문서(`app://starlog`)에서 온 것만** 받는다.
 * 창이 외부 페이지를 띄울 일은 없지만(외부 링크는 브라우저로 보낸다), 혹시 떠도 내 파일을 못 꺼내게
 */
function isTrustedSender(event) {
  try {
    return win !== null && !win.isDestroyed() && event.sender === win.webContents
      && event.senderFrame === event.sender.mainFrame && isAppUrl(event.senderFrame?.url ?? "");
  } catch {
    return false;
  }
}

function assertFromApp(event) {
  if (!isTrustedSender(event)) throw new Error("허용되지 않은 요청입니다");
}

/**
 * IPC는 **전부** 발신자를 본다 (보안 점검 2026-10-25). 예전엔 파일을 꺼내는 둘만 봤고,
 * 나머지(연결 설정 읽기·세이브 지우기·데이터 루트 바꾸기)는 어느 문서에서든 불렸다
 */
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    assertFromApp(event);
    return fn(event, ...args);
  });
}

/** 동기 IPC — 거절해도 `returnValue`는 채운다. 안 채우면 렌더러가 영영 멈춘다 */
function onSync(channel, fn) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      event.returnValue = null;
      return;
    }
    event.returnValue = fn(event, ...args);
  });
}

function onAsync(channel, fn) {
  ipcMain.on(channel, (event, ...args) => {
    if (isTrustedSender(event)) fn(event, ...args);
  });
}

function registerIpc() {
  /**
   * 지금 백엔드의 포트. **동기로 답한다.**
   *
   * 화면의 `apiBase`가 모듈을 불러오는 순간 주소를 정해야 하는데, 그때 비동기로 물어보면
   * **첫 요청 몇 개가 주소 없이 나간다.** 새로고침으로 앱 안의 화면이 곧바로 뜨는 경우가
   * 정확히 그렇다. 값 하나 읽는 것뿐이라 동기로 두는 값이 싸다
   */
  onSync("session:port", () => backendPort);

  /**
   * 지금 서버의 API 토큰 (**동기**, 포트와 같은 이유). 화면은 이걸 `X-Starlog-Token`에 싣고,
   * `<img>`·`<video>`처럼 머리말을 못 다는 주소에는 `t=`로 붙인다 (`lib/apiBase.ts`)
   */
  onSync("session:token", () => (backendPort ? tokens.get(backendPort) ?? null : null));

  handle("settings:get", () => {
    const settings = store.getSettings();
    return { ...settings, dirs: paths.ensureDataRoot(settings.dataRoot) };
  });

  /*
   * 배경 색 캐시 (프론트 F4). **입구(`app://`)는 백엔드가 뜨기 전이라 프로필을 못 읽는다** —
   * 본 앱이 색을 알게 될 때마다 여기 적어 두고, 입구는 첫 프레임 전에 **동기로** 읽는다.
   * 본 앱 포트가 매번 달라 렌더러의 localStorage는 실행 사이에 이어지지 않는다 → settings.json이 유일한 길.
   * 값은 모양만 믿는다: #rrggbb 다섯 개. 프리셋은 서버 프로필로 옮겼다(V14) — 입구가 쓸 일이 없다
   */
  onSync("background:get", () => {
    const s = store.getSettings();
    return { colors: s.backgroundColors ?? null };
  });

  onAsync("background:set", (_e, patch) => {
    const isHex = (c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
    const isFive = (v) => Array.isArray(v) && v.length === 5 && v.every(isHex);
    if (patch && (patch.colors === null || isFive(patch.colors))) store.patchSettings({ backgroundColors: patch.colors });
  });

  /**
   * ⚠️ **방금 [폴더 고르기]로 고른 경로만 받는다** (보안 점검 2026-10-25). 화면이 아무 문자열이나
   * 넘길 수 있으면 데이터 루트를 홈 폴더로 돌려 아래 `openPath`의 울타리가 통째로 넓어진다.
   * 지금 경로를 다시 저장하는 건 그대로 둔다
   */
  handle("settings:setDataRoot", (_e, dir) => {
    const resolved = path.resolve(String(dir ?? ""));
    const current = path.resolve(store.getSettings().dataRoot);
    if (resolved !== current && resolved !== pickedFolder) {
      throw new Error("[폴더 고르기]로 고른 폴더만 쓸 수 있습니다");
    }
    const check = inspectDataRoot(resolved);
    if (!check.ok) throw new Error(check.reason);
    paths.ensureDataRoot(resolved);
    pickedFolder = null;
    return store.patchSettings({ dataRoot: resolved });
  });

  /**
   * 경로를 바꾸기 전에 살펴본다.
   *
   * **경로가 이상한 걸 저장한 뒤에 알게 하면 안 된다** — 세이브파일이 엉뚱한 데로 가고
   * 그제서야 "왜 목록이 비었지"가 된다. 만들 수 있는지, 이미 우리 구조가 있는지 미리 답한다
   */
  handle("settings:inspectDataRoot", (_e, dir) => inspectDataRoot(dir));

  handle("dialog:pickFolder", async () => {
    const result = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
    if (result.canceled || !result.filePaths[0]) return null;
    // 데이터 루트로 받아줄 수 있는 건 이 값 하나뿐이다
    pickedFolder = path.resolve(result.filePaths[0]);
    return pickedFolder;
  });

  handle("shell:openFolder", (_e, which) => {
    // 자격증명이 있는 앱 폴더. **데이터 루트와 다른 곳**이라는 걸 눈으로 보게 한다 (§7)
    if (which === "appData") {
      shell.openPath(paths.APP_DATA);
      return;
    }
    const dirs = dataDirs();
    if (!Object.prototype.hasOwnProperty.call(dirs, which)) throw new Error("알 수 없는 폴더입니다");
    shell.openPath(dirs[which]);
  });

  /**
   * 절대 경로를 탐색기로 연다 (스크린샷 폴더).
   *
   * 백엔드가 경로를 알려주고 여는 것은 네이티브가 한다 — 브라우저는 로컬 경로를 못 연다.
   * ⚠️ **데이터 루트 안의 폴더만.** `openPath`는 파일이면 **실행한다**(맥 `.app`·`.command`, 윈도우 `.exe`·`.lnk`).
   * 실제 경로(심볼릭 링크를 푼 것)로 보고, 맥의 앱 묶음(`.app`도 폴더다)은 거절한다
   */
  handle("shell:openPath", (_e, target) => {
    const dirs = dataDirs();
    let root;
    let real;
    try {
      root = fs.realpathSync(path.resolve(dirs.root));
      real = fs.realpathSync(path.resolve(String(target ?? "")));
    } catch {
      throw new Error("폴더를 찾을 수 없습니다");
    }
    /*
     * ⚠️ **구분자까지 봐야 한다.** `startsWith(root)`만 쓰면 데이터 루트가 `~/starlog`일 때
     * **형제 폴더인 `~/starlog-비밀`도 통과한다**
     */
    if (real !== root && !real.startsWith(root + path.sep)) {
      throw new Error("데이터 폴더 밖은 열 수 없습니다");
    }
    if (!fs.statSync(real).isDirectory() || isBundle(real)) {
      throw new Error("폴더만 열 수 있습니다");
    }
    shell.openPath(real);
  });

  // ── 스크린샷 관리자: 클립보드 · 내보내기 (P6 S2) ──

  /**
   * 화면이 주는 건 `{entryId, fileName}`뿐이다. **실제 경로는 서버에게 묻는다** — 소유권·폴더 탈출 검사를
   * 서버가 이미 한다. 받은 경로도 그대로 믿지 않고 `<데이터 루트>/media/<게임>/<파일>`인지 다시 본다
   */
  async function resolveMediaRefs(refs) {
    if (!Array.isArray(refs) || refs.length === 0 || refs.length > 5000) throw new Error("고른 파일이 없습니다");
    if (!backendPort || !backendMediaRoot) throw new Error("서버가 떠 있지 않습니다");
    const out = [];
    for (const ref of refs) {
      const entryId = ref?.entryId, fileName = ref?.fileName;
      if (!Number.isSafeInteger(entryId) || entryId <= 0 || typeof fileName !== "string" || fileName === "") {
        throw new Error("잘못된 파일입니다");
      }
      const label = { entryId, fileName };
      let file = null;
      try {
        const { path: reported } = await getJson(backendPort,
          `/api/backlog/${entryId}/screenshots/${encodeURIComponent(fileName)}/path`);
        file = media.mediaFileInside(backendMediaRoot, reported);
      } catch { /* 없어진 파일 — 아래에서 실패로 센다 */ }
      out.push({ file, label });
    }
    return out;
  }

  /**
   * `target`은 `{entryId, fileName}` 하나 또는 그 배열이다 (최대 `MAX_COPY`). **하나라도 못 풀면 아무것도 안 복사한다** —
   * 일부만 붙은 채로 성공처럼 보이면 사람이 모른다
   */
  handle("media:copy", async (event, target) => {
    assertFromApp(event);
    const refs = Array.isArray(target) ? target : [target];
    if (refs.length > media.MAX_COPY) throw new Error("한 번에 복사할 수 있는 개수를 넘었습니다");
    const resolved = await resolveMediaRefs(refs);
    const failed = resolved.filter((r) => !r.file).map((r) => r.label);
    if (failed.length > 0) return { ok: false, reason: "NOT_FOUND", failed };
    // 같은 파일을 두 번 고른 요청은 한 번으로 — 붙여넣을 때 중복되지 않게
    return media.copyToClipboard([...new Set(resolved.map((r) => r.file))]);
  });

  /** 저장할 폴더는 **매번** 고른다 (사용자 결정) — 마지막 폴더를 기억해 조용히 쏟아붓지 않는다 */
  handle("media:saveTo", async (event, refs) => {
    assertFromApp(event);
    const resolved = await resolveMediaRefs(refs);
    const picked = await dialog.showOpenDialog(win, {
      title: "저장할 폴더",
      buttonLabel: "여기에 저장",
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
    const folder = picked.filePaths[0];
    const { saved, failed } = media.saveFiles(resolved.filter((r) => r.file), folder);
    for (const r of resolved) if (!r.file) failed.push({ ...r.label, reason: "NOT_FOUND" });
    return { canceled: false, folder, saved, failed };
  });

  handle("saves:list", () => saveFiles.list(dataDirs()));

  /*
   * 폴더를 미리 만들지 않는다 — 서버(PGlite)가 첫 기동에 만든다.
   * 여기서 빈 폴더를 만들면 서버가 "남의 DB"인지 "새 DB"인지 헷갈린다.
   * 그래서 이 핸들러가 하는 일은 **이름 검사와 중복 확인**뿐이다
   */
  handle("saves:create", (_e, name) => {
    const clean = assertSaveName(name);
    const { saves } = dataDirs();
    if (pouring.has(clean) || saveFiles.taken({ saves }, clean)) {
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
  handle("saves:rename", async (_e, from, to) => {
    const oldName = assertSaveName(from);
    const newName = assertSaveName(to);
    if (oldName === newName) return newName;

    const dirs = dataDirs();
    if (pouring.has(oldName) || pouring.has(newName)) {
      throw new Error("이 세이브파일을 만드는 중입니다. 끝난 뒤 다시 시도해 주세요");
    }
    if (saveFiles.taken(dirs, newName)) {
      throw new Error("같은 이름의 세이브파일이 이미 있습니다");
    }
    if (!saveFiles.exists(dirs, oldName)) {
      throw new Error("세이브파일을 찾을 수 없습니다");
    }

    // 열고 있으면 못 바꾼다 — 윈도우는 거부하고, 맥은 바뀌되 서버가 옛 이름을 붙든다
    if (session?.mode === "local" && session.target === oldName) {
      await stopBackend();
    }

    saveFiles.rename(dirs, oldName, newName);

    /*
     * ⚠️ **[최근 접속]을 폴더 바로 다음에 옮긴다** (2026-10-25). 백업 폴더 옮기기에서 던지면(윈도우 EBUSY 등)
     * 예전엔 여기까지 못 와서 [최근 접속]이 사라진 이름을 가리켰고, 누르면 그 이름으로 빈 세이브가 생겼다
     */
    const settings = store.getSettings();
    if (settings.lastMode === "local" && settings.lastTarget === oldName) {
      store.patchSettings({ lastTarget: newName });
    }

    const oldBackups = path.join(dirs.backups, oldName);
    if (fs.existsSync(oldBackups)) {
      const target = path.join(dirs.backups, newName);
      try {
        /*
         * 새 이름의 백업 폴더가 이미 있으면(전에 같은 이름을 쓴 적이 있다) 안으로 옮겨 합친다.
         * 통째로 rename하면 **있던 백업을 덮어써서 지운다**
         */
        if (fs.existsSync(target)) {
          for (const file of fs.readdirSync(oldBackups)) {
            const to2 = path.join(target, file);
            if (!fs.existsSync(to2)) saveFiles.renameWithRetry(path.join(oldBackups, file), to2);
          }
          fs.rmSync(oldBackups, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } else {
          saveFiles.renameWithRetry(oldBackups, target);
        }
      } catch (e) {
        // 세이브는 이미 새 이름이다 — 되돌리다 또 실패하느니 무엇이 남았는지 정확히 말한다
        throw new Error(`이름은 바꿨지만 백업 폴더를 옮기지 못했습니다. 데이터 폴더의 backups/${oldName}을(를) `
          + `backups/${newName}(으)로 직접 옮겨 주세요 (${e?.code ?? e?.message ?? e})`);
      }
    }
    return newName;
  });

  handle("saves:remove", async (_e, name) => {
    const clean = assertSaveName(name);
    if (pouring.has(clean)) throw new Error("이 세이브파일을 만드는 중입니다. 끝난 뒤 다시 시도해 주세요");
    // 열고 있는 파일은 못 지운다 — 윈도우는 아예 거부하고, 맥은 지워지되 서버가 유령을 붙든다
    if (session?.mode === "local" && session.target === clean) {
      await stopBackend();
    }

    const dirs = dataDirs();
    saveFiles.remove(dirs, clean);
    // 백업도 함께. 남겨두면 주인 없는 폴더가 쌓이고, 목록에서 지운 것이 되살아난 것처럼 보인다
    backup.removeAll(dirs, clean);

    /*
     * ⚠️ **[최근 접속]도 같이 지운다.** 개명(`saves:rename`)에는 있는데 여기만 빠져 있었다.
     * 지운 뒤에도 입구에 [최근 접속]이 남아서, 누르면 **없는 파일을 열려다 같은 이름으로
     * 빈 세이브를 새로 만든다** — PGlite는 폴더가 없으면 그냥 만들기 때문이다.
     * 사용자 눈에는 "지운 세이브가 되살아났는데 안이 텅 비었다"로 보인다. 실제로 겪었다
     */
    const settings = store.getSettings();
    if (settings.lastMode === "local" && settings.lastTarget === clean) {
      store.patchSettings({ lastMode: null, lastTarget: null });
    }
    return true;
  });

  // ── 백업 (9단계). 전부 일렉트론이 한다 — 백엔드는 백업 폴더에 손을 안 댄다

  handle("backups:usage", (_e, saveName) =>
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
  handle("backups:create", async (_e, saveName) => {
    const clean = assertSaveName(saveName);
    if (session?.mode === "local" && session.target === clean) {
      await stopBackend();
    }
    return backup.create(dataDirs(), clean);
  });

  /** 되돌리기 — 새 세이브파일이 하나 생긴다. 원본은 그대로 남는다 */
  handle("backups:restore", (_e, saveName, fileName) =>
    backup.restore(dataDirs(), assertSaveName(saveName), assertBackupName(fileName)));

  handle("backups:remove", (_e, saveName, fileName) => {
    backup.remove(dataDirs(), assertSaveName(saveName), assertBackupName(fileName));
    return true;
  });

  /*
   * ⚠️ **화면에는 가린 값만 준다** (보안 점검 2026-10-25). 비밀 칸은 `••••끝네자`와 `hasSecret`.
   * 가린 값 그대로 저장·테스트하면 메인이 저장된 진짜 값으로 바꿔 쓴다 (`settings.js` `unmask`).
   * `previousName` — 고치는 항목의 옛 이름. 진짜 값은 그쪽에 있고, 이름을 바꿨으면 그 항목을 제자리에서 바꾼다
   */
  handle("connections:list", () => store.listMasked());
  handle("connections:save", async (_e, profile, options) => {
    const previousName = typeof options?.previousName === "string" ? options.previousName : undefined;
    const saved = await store.saveConnection(profile, previousName);
    const name = typeof profile?.name === "string" ? profile.name.trim() : "";
    if (previousName && name && previousName !== name) {
      retargetConnection(previousName, name);
      // 백업이 옛 이름 폴더에 남으면 목록에서 사라진다 (지워지진 않았는데 못 찾는다)
      try {
        cloudBackup.renameFolder(dataDirs(), previousName, name);
      } catch (e) {
        console.error("[cloud-backup] 백업 폴더를 옮기지 못했습니다", e);
      }
    }
    return saved;
  });
  handle("connections:remove", async (_e, name) => {
    const clean = String(name ?? "");
    const left = await store.removeConnection(clean);
    // [최근 접속]이 지운 연결을 가리키면 눌러도 "찾을 수 없습니다"만 뜬다
    const settings = store.getSettings();
    if (settings.lastMode === "cloud" && settings.lastTarget === clean) {
      store.patchSettings({ lastMode: null, lastTarget: null });
    }
    return left;
  });
  /** 눈 버튼. 칸 하나만 진짜 값으로 */
  handle("connections:reveal", (_e, name, field) => store.revealSecret(String(name ?? ""), String(field ?? "")));

  /**
   * 연결 테스트 (2026-08-28 → 2026-10-25 다시 짬).
   *
   * ## 🔴 지금 쓰는 백엔드를 절대 안 건드린다
   *
   * 예전엔 죽였다가 되살렸는데, **되살릴 때 포트가 바뀐다.** 창은 옛 포트를 보고 있으니
   * 그 뒤로 앱 전체가 `TypeError: Failed to fetch`가 됐다. 시험 대상은 PostgreSQL이라
   * 동시 접속이 되므로, 다른 포트에 시험용을 띄우고 내리면 끝이다.
   *
   * ## 🔴 대상 DB에 아무것도 쓰지 않는다 (2026-10-25)
   *
   * 예전엔 시험용이 **서버 전체를 부팅**했다 — 오타로 빈 Postgres나 남의 DB를 가리켜도 [테스트]만 눌러
   * 스키마·프로필 행이 생기고 기동 작업이 돌았다. 이제 둘로 나눈다:
   *
   *   DB                 `STARLOG_CHECK_ONLY` — 열고(`select 1` + 스키마 점검) 진단만 내고 내려간다
   *   스토리지·IGDB·번역  **메모리 DB**(`memory://`)로 띄운 시험용에 눌러 본다 — 사용자의 DB와 무관하다
   *
   * 둘이 따로라 DB가 틀려도 스토리지·키 결과는 나온다 — "어디가 틀렸나"가 좁혀진다.
   *
   * @param options `{ scope }` — `"all"`(기본, 입구의 관문)은 넷 다, `"db"`·`"storage"`는 그 하나만
   *                (앱 안의 섹션 버튼. IGDB·번역은 앱 안에서 지금 서버로 바로 시험한다)
   */
  handle("connections:test", async (_e, input, options) => {
    const scope = ["all", "db", "storage"].includes(options?.scope) ? options.scope : "all";
    const profile = await store.resolveProfile(input, options?.previousName);
    const wantDb = scope !== "storage";
    const want = {
      storage: scope !== "db" && Boolean(profile.storage?.endpoint && profile.storage?.bucket),
      igdb: scope === "all" && Boolean(profile.igdb?.clientId && profile.igdb?.clientSecret),
      translate: scope === "all" && Boolean(profile.translate?.apiKey),
    };

    const [db, services] = await Promise.all([
      wantDb ? checkDatabase(profile) : null,
      want.storage || want.igdb || want.translate ? checkServices(profile, want) : {},
    ]);
    const { storage = null, igdb = null, translate = null } = services;

    return {
      ok: (db?.ok ?? true) && (storage?.ok ?? true) && (igdb?.ok ?? true) && (translate?.ok ?? true),
      code: db?.code ?? null,
      // 스토리지만 볼 때는 DB를 안 봤다 — 화면이 "데이터베이스 연결됨"을 그리면 거짓말이 된다
      database: db ? { ok: db.ok } : null,
      storage,
      igdb,
      translate,
    };
  });

  /**
   * 기동. 화면은 `{ mode, target, resume? }`를 준다 — `resume`은 [최근 접속]에서 눌렀다는 뜻이다.
   *
   * ## 실패하면 반드시 돌아온다 (2026-10-25)
   *
   * 90초 안에 안 뜨면 서버를 **내리고** `TIMEOUT`으로 답한다. 예전엔 타임아웃 뒤 "서버가 죽기를"
   * 기다렸는데 살아 있는 서버는 안 죽어서, 입구가 "기록을 여는 중"에 영원히 멈췄다.
   * [취소](`launch:cancel`)·겹친 기동은 `launchSeq`로 가른다 — 낡은 기동은 아무 말 없이 `SUPERSEDED`로 끝난다
   */
  handle("launch", async (_e, request) => {
    if (request?.mode !== "local" && request?.mode !== "cloud") throw new Error("잘못된 모드입니다");
    const mine = ++launchSeq;
    const stale = () => mine !== launchSeq;
    const superseded = { ok: false, code: "SUPERSEDED" };
    pendingEntryError = null;
    const target = request.mode === "local" ? assertSaveName(request.target) : String(request.target ?? "");
    const fail = (code) => {
      launching = { mode: request.mode, target };
      progress({ phase: "error", code });
      return { ok: false, code };
    };

    /*
     * [최근 접속]은 **있는 것만** 연다 (2026-10-25). 세이브는 폴더가 없으면 PGlite가 그 이름으로
     * 빈 DB를 만든다 — 지우거나 이름을 바꾼 세이브를 누르면 "빈 세이브가 되살아난" 걸로 보였다.
     * 새 세이브 만들기는 `resume` 없이 오므로 그대로 만들어진다
     */
    if (request.resume && request.mode === "local" && !saveFiles.exists(dataDirs(), target)) {
      forgetLastTarget("local", target);
      return fail("SAVE_MISSING");
    }
    // 붓는 중인 세이브는 시험용이 쥐고 있다 — 열면 같은 폴더를 두 프로세스가 연다
    if (request.mode === "local" && pouring.has(target)) return fail("DB_IN_USE");
    const profile = request.mode === "cloud"
      ? (await store.getConnections()).find((p) => p.name === target) ?? null
      : null;
    if (stale()) return superseded;
    if (request.mode === "cloud" && !profile) {
      forgetLastTarget("cloud", target);
      return fail("CONNECTION_MISSING");
    }
    /*
     * 키체인에서 못 푼 연결 — 빈 비밀번호로 띄우면 "비밀번호가 틀렸다"로 보여 원인이 가려진다.
     * 다시 입력하라고 분명히 말한다
     */
    if (profile?.locked) return fail("CREDENTIALS_LOCKED");
    const config = request.mode === "local" ? localConfig(target) : cloudConfig(profile);

    /*
     * ⚠️ **먼저 옛 백엔드를 죽이고 기다린다.** 살아 있는 놈이 세이브파일을 쥔 채로 같은 폴더를
     * 다시 열면 `DB_IN_USE`다. 다른 세이브를 골랐더라도 죽인다: 백엔드는 한 번에 하나다
     */
    launching = { mode: request.mode, target };
    progress({ phase: "starting" });
    await stopBackend();
    if (stale()) return superseded;

    /*
     * 로컬 모드는 띄우기 **전에** 백업한다. DB가 닫혀 있는 유일한 순간이라 그냥 묶으면 되고,
     * 스키마 업그레이드가 일어난다면 그 직전이 된다. 실패해도 기동은 막지 않는다
     */
    if (request.mode === "local") {
      try {
        backup.autoBackup(dataDirs(), target);
      } catch (e) {
        console.error("[backup] 자동 백업 실패 — 기동은 계속한다", e);
      }
    }

    const port = await freePort();
    if (stale()) return superseded;
    const { proc, exited } = startBackend(port, config);

    progress({ phase: "waiting" });
    try {
      // 그 프로세스의 생사만 본다 — 겹친 기동이 띄운 남의 서버를 내 것으로 보면 안 된다
      await waitForBackend(port, LAUNCH_TIMEOUT_MS, () => proc !== null && backend === proc);
    } catch (e) {
      if (stale()) return superseded;
      let code;
      if (e.message === "TIMEOUT") {
        if (backend === proc) await stopBackend();
        code = "TIMEOUT";
      } else {
        code = (await exited)?.diagnostic ?? "BACKEND_DIED";
      }
      if (stale()) return superseded;
      return fail(code);
    }
    // 뜬 사이 [취소]나 다른 기동이 왔다 — 그쪽이 이 서버를 내린다
    if (stale() || backend !== proc) return superseded;

    session = { mode: request.mode, target };
    // 서버는 이미 떴다 — 설정 파일 하나 못 쓴다고(윈도우 백신 EPERM) 기동을 실패로 돌리지 않는다
    try {
      store.patchSettings({ lastMode: request.mode, lastTarget: target });
    } catch (err) {
      console.error("[settings] 마지막 접속을 저장하지 못했습니다", err);
    }
    progress({ phase: "ready" });
    maybeAutoCloudBackup(request.mode, target);
    backendStorage = csp.storageOrigins([{ endpoint: config.env.APP_STORAGE_ENDPOINT, publicBaseUrl: config.env.APP_STORAGE_PUBLIC_BASE_URL }]);
    /*
     * **창을 안 옮긴다.** 포트만 알려주고 화면이 스스로 `/dashboard`로 라우팅한다 —
     * 같은 문서 안의 이동이라 배경도 알림도 안 끊긴다.
     * 단, 지금 문서의 CSP에 이 연결의 스토리지가 없으면(문서를 받은 뒤 만든 연결) 커버가 막힌다 → 한 번 새로 받게 한다
     */
    return csp.covers(documentStorage, backendStorage) ? { ok: true, port } : { ok: true, port, reload: true };
  });

  /**
   * 기동 대기 중의 [취소] (2026-10-25). 지금 기동을 낡은 것으로 만들고 띄우던 서버를 내린다.
   * 입구는 "기록을 여는 중"에서 빠져나올 길이 없었다 — 콜드스타트가 길면 앱을 꺼야 했다
   */
  handle("launch:cancel", async () => {
    launchSeq += 1;
    launching = null;
    await stopBackend();
    return true;
  });

  /** 앱 안에서 서버가 죽어 입구로 왔을 때의 이유. **한 번 가져가면 지운다** — 다시 들어올 때 또 뜨면 안 된다 */
  handle("launch:takeError", () => {
    const found = pendingEntryError;
    pendingEntryError = null;
    return found;
  });

  /**
   * 클라우드 데이터를 **로컬 세이브파일로 뽑는다** (architecture §6).
   *
   * 세이브파일은 PGlite 폴더 그 자체라서, 뽑아낸 순간 이미 열 수 있는 상태다 — "복원" 절차가 없다.
   * 행을 직접 복사하지 않고 **이미 실데이터로 검증된 `/api/me/export`·`import`**를 쓴다:
   *
   * <pre>
   *   1. 지금 붙어 있는 클라우드에서 JSON을 받는다
   *   2. 새 이름으로 로컬 서버를 잠깐 띄운다 → 마이그레이션이 빈 스키마를 만든다
   *   3. 그 서버에 JSON을 부어넣는다
   *   4. 내린다. 세이브파일 하나가 남는다
   * </pre>
   *
   * ## 🔴 지금 쓰는 백엔드를 안 건드린다 (2026-08-28)
   *
   * 예전엔 클라우드 백엔드를 죽이고 → 로컬을 띄워 부어넣고 → **새 포트로** 되살렸는데 창을 옮기는 줄이
   * 없어서, 뽑기가 성공한 순간부터 앱 전체가 `Failed to fetch`가 됐다. 상대는 다른 DB의 다른 포트라
   * 시험용처럼 격리해서 띄우고 내리면 창도 세션도 그대로다.
   *
   * ⚠️ **커버 실물은 안 따라온다.** 클라우드 커버는 스토리지에 있다.
   * 가져오기가 "파일 없으면 건너뛴다"로 처리하므로 마스터 커버로 폴백된다 — 화면이 그걸 미리 말해준다
   */
  handle("cloud:toSaveFile", async (_e, saveName) => {
    if (session?.mode !== "cloud" || !backendPort) {
      throw new Error("클라우드 모드로 접속 중일 때만 뽑을 수 있습니다");
    }
    // 시작한 순간의 서버를 붙든다 — 오래 걸리는 사이 다른 연결로 들어가면 엉뚱한 서버에서 받는다
    const port = backendPort;
    const clean = assertSaveName(saveName);
    const dirs = dataDirs();
    reserveSave(dirs, clean);
    let dump;
    try {
      dump = await getJson(port, "/api/me/export");
    } catch (e) {
      pouring.delete(clean);
      throw e;
    }
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
   * 읽어올 세이브파일은 **시험용처럼 격리해서** 잠깐 띄운다.
   * ⚠️ 시작한 순간의 서버(포트)를 붙들고, 덮어쓰기 직전에 **아직 그 서버인지** 다시 본다 —
   * 수십 초 사이 다른 연결로 들어갔으면 엉뚱한 DB를 덮어쓴다
   */
  handle("saveFile:toCloud", async (_e, saveName) => {
    if (session?.mode !== "cloud" || !backendPort) {
      throw new Error("데이터베이스로 접속 중일 때만 올릴 수 있습니다");
    }
    const port = backendPort;
    const owner = session;
    const clean = assertSaveName(saveName);
    const dirs = dataDirs();
    if (!saveFiles.exists(dirs, clean)) {
      throw new Error("세이브파일을 찾을 수 없습니다");
    }

    /*
     * ① 안전망. 지금 데이터베이스에 든 것을 세이브파일 하나로 뽑아둔다.
     *    이름이 겹치면 뒤에 번호를 붙인다 — 여러 번 덮어써도 매번 남아야 한다.
     *    시각은 백업과 같은 **로컬 시각**이다 (예전엔 여기만 UTC라 9시간 어긋났다)
     */
    const stamp = backup.stamp(new Date());
    let safety = names.fit(`덮어쓰기 전 ${owner.target} ${stamp}`);
    for (let i = 2; pouring.has(safety) || saveFiles.taken(dirs, safety); i += 1) {
      safety = names.fit(`덮어쓰기 전 ${owner.target} ${stamp}`, `-${i}`);
    }
    reserveSave(dirs, safety);
    let before;
    try {
      before = await getJson(port, "/api/me/export");
    } catch (e) {
      pouring.delete(safety);
      throw e;
    }
    await pourInto(safety, before);

    // ② 올릴 것을 읽어온다. 세이브파일을 격리해서 잠깐 띄운다
    const probePort = await freePort();
    const probe = spawnProbe(probePort, localConfig(clean));
    let dump;
    try {
      const up = await settleProbe(probe, probePort);
      if (!up.ready) throw new Error(`세이브파일을 열지 못했습니다 (${up.code})`);
      dump = await getJson(probePort, "/api/me/export");
    } finally {
      await probe.stop();
    }

    // ③ 덮어쓴다. 여기서 실패해도 ①이 남아 있다
    if (backendPort !== port || session !== owner) {
      throw new Error(`접속이 바뀌어 덮어쓰지 않았습니다. 안전망 세이브(${safety})는 남아 있습니다`);
    }
    const result = await postJson(port, "/api/me/replace", dump);

    /*
     * 창이 보고 있는 건 **덮어쓰기 전의 데이터**다. 그대로 두면 없는 항목을 눌러
     * 404를 보게 된다. 포트는 그대로라 새로고침이면 충분하다
     */
    if (win && !win.isDestroyed()) win.webContents.reload();
    return { ...result, safetySaveName: safety };
  });

  /**
   * 입구로 나간다. **백엔드는 그대로 둔다** (2026-08-28 결정).
   *
   * 예전엔 여기서 죽였다 — "DB를 갈아끼우러 나가는 것"으로 봤기 때문이다.
   * 그런데 실제로는 잘못 들어왔거나 설정을 보러 나가는 쪽이 훨씬 흔하고,
   * 그때마다 다시 기다리는 건 값을 못 한다. 살려두면 [최근 접속]이 **즉시**다
   */
  // ── 클라우드 백업 (2026-10-25). 대상은 언제나 **지금 세션** — 화면은 연결 이름을 고르지 않는다

  const backupTarget = () => {
    if (!session || !backendPort) throw new Error("서버가 떠 있지 않습니다");
    return session.target;
  };

  handle("cloudBackups:list", () => cloudBackup.list(dataDirs(), backupTarget()));
  handle("cloudBackups:suggestName", () => cloudBackup.suggestName(dataDirs(), backupTarget()));
  /** 화면이 붙을 때 가져간다 — 붙기 전에 쏜 이벤트를 놓쳤을 수 있다 */
  handle("cloudBackups:status", () => ({ ...cloudBackupStatus }));

  handle("cloudBackups:create", async (_e, name) => {
    const clean = assertSaveName(name);
    backupTarget();
    return runCloudBackup("manual", `${clean}${cloudBackup.EXT}`);
  });

  /**
   * 백업 → **새 로컬 세이브**. 지금 서버는 안 건드린다(파일만 읽는다).
   * 이름을 안 주면 `<연결> <백업 이름>`으로 짓고, 겹치면 번호를 붙인다. 주면 겹칠 때 거절한다
   */
  handle("cloudBackups:restore", async (_e, kind, fileName, saveName) => {
    const target = backupTarget();
    cloudBackup.assertFileName(kind, fileName);
    const dirs = dataDirs();
    let name;
    if (saveName !== undefined && saveName !== null && saveName !== "") {
      name = assertSaveName(saveName);
    } else {
      const base = `${target} ${fileName.slice(0, -cloudBackup.EXT.length)}`;
      name = names.fit(base);
      for (let i = 2; pouring.has(name) || saveFiles.taken(dirs, name); i += 1) name = names.fit(base, `-${i}`);
    }
    const dump = await cloudBackup.read(dirs, target, kind, fileName);
    reserveSave(dirs, name);
    await pourInto(name, dump);
    return { saveName: name };
  });

  handle("cloudBackups:remove", (_e, kind, fileName) => {
    cloudBackup.remove(dataDirs(), backupTarget(), kind, fileName);
    return true;
  });

  /** 종류의 폴더를 연다. 경로는 화면이 아니라 여기서 정한다 */
  handle("cloudBackups:openFolder", (_e, kind) => {
    const folder = cloudBackup.folderOf(dataDirs(), backupTarget(), kind);
    if (!fs.existsSync(folder)) throw new Error("아직 이 종류의 백업이 없습니다");
    shell.openPath(folder);
  });

  handle("backToEntry", () => {
    loadEntry();
    return true;
  });

  /**
   * 입구 화면이 [최근 접속] 버튼을 그릴지, 그게 즉시인지 기동인지 정하는 데 쓴다.
   * 지난 기록은 **아직 있는 것만** 준다 — 탐색기에서 지웠거나 다른 곳에서 이름을 바꿨을 수 있다
   */
  handle("session:current", async () => {
    if (session && backendPort) {
      return { ...session, alive: true };
    }
    const settings = store.getSettings();
    if (!settings.lastMode || !settings.lastTarget) return null;
    try {
      const there = settings.lastMode === "local"
        ? saveFiles.exists(dataDirs(), settings.lastTarget)
        : (await store.getConnections()).some((p) => p.name === settings.lastTarget);
      if (!there) return null;
    } catch {
      return null;
    }
    return { mode: settings.lastMode, target: settings.lastTarget, alive: false };
  });

  /** 살아 있는 백엔드로 되돌아간다. 창만 옮기면 끝이라 기다릴 게 없다 */
  handle("session:resume", () => {
    if (!session || !backendPort) {
      return null;
    }
    // 창을 옮기지 않는다. 포트만 주면 화면이 알아서 들어간다 (CSP가 모자랄 때만 새로 받기 — launch와 같은 이유)
    return csp.covers(documentStorage, backendStorage) ? { port: backendPort } : { port: backendPort, reload: true };
  });
}

/** [최근 접속]이 없어진 대상을 가리키면 지운다 */
function forgetLastTarget(mode, target) {
  try {
    const settings = store.getSettings();
    if (settings.lastMode === mode && settings.lastTarget === target) {
      store.patchSettings({ lastMode: null, lastTarget: null });
    }
  } catch { /* 못 지워도 다음 `session:current`가 걸러낸다 */ }
}

/**
 * 연결 이름이 바뀌었다 — 지금 세션·[최근 접속]이 옛 이름을 가리키면 따라 옮긴다 (2026-10-25).
 * 앱 안 연결 탭에서 이름을 고치면 세션이 옛 이름을 들고 있어서, 탭을 다시 열면 프로필을 못 찾아
 * 스켈레톤이 영원히 돌았다
 */
function retargetConnection(from, to) {
  if (session?.mode === "cloud" && session.target === from) session = { ...session, target: to };
  if (launching?.mode === "cloud" && launching.target === from) launching = { ...launching, target: to };
  try {
    const settings = store.getSettings();
    if (settings.lastMode === "cloud" && settings.lastTarget === from) store.patchSettings({ lastTarget: to });
  } catch { /* 다음 `session:current`가 걸러낸다 */ }
}

/** DB만 본다 — 열어 보고 진단만 내는 점검 전용 기동. 대상 DB에 스키마·행을 만들지 않는다 */
async function checkDatabase(profile) {
  const base = cloudConfig(profile);
  const config = { ...base, env: { ...base.env, STARLOG_CHECK_ONLY: "true" } };
  const port = await freePort();
  const probe = spawnProbe(port, config);
  try {
    const up = await settleProbe(probe, port, { checkOnly: true });
    return up.ready ? { ok: true, code: null } : { ok: false, code: up.code };
  } finally {
    await probe.stop();
  }
}

/**
 * 스토리지·IGDB·번역 — **메모리 DB**로 띄운 시험용에 눌러 본다.
 *
 * 우리 서버가 버킷을 눌러 보는 방식이라 서버가 떠야 하는데, 사용자의 DB로 띄우면 DB가 틀렸을 때
 * 스토리지는 멀쩡해도 "실패"가 되고, 맞을 때는 시험만으로 그 DB에 쓴다
 */
async function checkServices(profile, want) {
  const base = cloudConfig(profile);
  const config = {
    ...base,
    env: {
      ...base.env,
      STARLOG_DB_URL: undefined,
      STARLOG_DB_USER: undefined,
      STARLOG_DB_PASSWORD: undefined,
      STARLOG_DB_SCHEMA: undefined,
      STARLOG_DB_DIR: "memory://",
    },
  };
  const port = await freePort();
  const probe = spawnProbe(port, config);
  try {
    const up = await settleProbe(probe, port);
    if (!up.ready) {
      const down = { ok: false, message: `시험용 서버를 띄우지 못했습니다 (${up.code})` };
      return {
        storage: want.storage ? down : null,
        igdb: want.igdb ? down : null,
        translate: want.translate ? down : null,
      };
    }
    const failed = (e) => ({ ok: false, message: String(e?.message ?? e) });
    const out = { storage: null, igdb: null, translate: null };
    if (want.igdb) {
      out.igdb = await postJson(port, "/api/system/settings/igdb/test", {
        clientId: profile.igdb.clientId,
        clientSecret: profile.igdb.clientSecret,
      }).catch(failed);
    }
    if (want.storage) {
      /*
       * ⚠️ **실제로 버킷을 눌러본다.** `/api/system`의 `configured`는 "값이 채워져 있나"일 뿐이라
       * 비밀번호를 틀려도 통과했다
       */
      out.storage = await getJson(port, "/api/system/storage/check").catch(failed);
    }
    if (want.translate) {
      // ⚠️ 글자를 안 쓰는 방법(`languages`)으로 시험한다 — 번역은 보낸 글자에 값이 매겨진다
      out.translate = await postJson(port, "/api/system/settings/translate/test", {
        apiKey: profile.translate.apiKey,
      }).catch(failed);
    }
    return out;
  } finally {
    await probe.stop();
  }
}

function localConfig(saveName) {
  const { dataRoot } = store.getSettings();
  return {
    mode: "local",
    env: {
      // 세이브파일 = PGlite 데이터 폴더
      STARLOG_DB_DIR: saveFiles.dirOf(paths.subPaths(dataRoot), saveName),
      STARLOG_DATA_ROOT: dataRoot,
      /*
       * 로컬 모드에는 스토리지가 아예 없다 — 명시적으로 꺼서 넘긴다.
       * 안 넘기면 서버 기본값(false)에 기대게 되는데, **기본값에 기대는 것과
       * 값을 정해서 주는 것은 다르다** — 기본값이 바뀌면 조용히 동작이 바뀐다
       */
      STARLOG_MEDIA_USE_STORAGE_FOR_COVERS: "false",
      STARLOG_MEDIA_USE_STORAGE_FOR_SCREENSHOTS: "false",
    },
  };
}

function cloudConfig(profile) {
  const db = profile.db ?? {};
  const storage = profile.storage ?? {};
  const { dataRoot } = store.getSettings();
  return {
    mode: "cloud",
    env: {
      /*
       * 주소는 연결 설정에 저장된 그대로 넘긴다 — `jdbc:postgresql://…`(옛 연결)이면 서버가 `jdbc:`를 떼고,
       * `postgresql://…`도 그대로 된다. 사용자·비번·스키마는 따로. 스키마(결정 60)는 서버가 연결마다
       * `search_path`로 건다 — 있으면 남의 테이블과 한 DB에서 공존해 DB_NOT_EMPTY가 아예 안 생긴다
       */
      STARLOG_DB_URL: db.url,
      STARLOG_DB_USER: db.user,
      STARLOG_DB_PASSWORD: db.password,
      STARLOG_DB_SCHEMA: db.schema,
      STARLOG_DATA_ROOT: dataRoot,
      /*
       * 무엇을 스토리지에 올릴지 (사용자 결정 2026-08-28).
       * 체크 안 한 것은 데이터 루트에 저장된다. **자격증명이 없으면 서버가 무시한다** —
       * 올릴 데가 없는데 켜져 있으면 업로드가 502로 실패할 뿐이다 (MediaTargets).
       * ⚠️ 스크린샷은 아직 서버가 스토리지에 올리지 않는다(데이터 폴더 전용) — 저장된 체크가 있어도 끈 채로 넘긴다
       */
      STARLOG_MEDIA_USE_STORAGE_FOR_COVERS: String(!!profile.mediaTargets?.covers),
      STARLOG_MEDIA_USE_STORAGE_FOR_SCREENSHOTS: "false",
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
    },
  };
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
  // 지난 실행이 붓다 만 세이브(앱이 도중에 꺼졌다) — 목록에 멀쩡한 세이브처럼 뜨지 않게 치운다
  try {
    const removed = saveFiles.cleanPartials(dataDirs());
    if (removed.length) console.error(`[saves] 만들다 만 세이브를 치웠습니다: ${removed.join(", ")}`);
  } catch (e) {
    console.error("[saves] 만들다 만 세이브를 치우지 못했습니다", e);
  }
  // 쓰다 만 클라우드 백업(`.partial`) — 이름이 달라 목록엔 안 뜨지만 쌓이지 않게
  try {
    const removed = cloudBackup.cleanPartials(dataDirs());
    if (removed.length) console.error(`[cloud-backup] 쓰다 만 백업을 치웠습니다: ${removed.join(", ")}`);
  } catch (e) {
    console.error("[cloud-backup] 쓰다 만 백업을 치우지 못했습니다", e);
  }
  protocol.handle("app", serveWeb);
  lockPermissions();
  registerIpc();
  createWindow();
});

app.on("window-all-closed", () => app.quit());

/**
 * 나가기 전에 **서버가 정말 내려갈 때까지 기다린다.**
 *
 * 예전엔 `app.on("before-quit", stopBackend)`였는데, 일렉트론은 핸들러가 돌려준 Promise를
 * 기다려주지 않는다 — 신호만 보내고 자기는 즉시 끝났다. 서버가 세이브파일 잠금을 놓기 전에
 * 일렉트론이 사라지므로, **끄고 바로 다시 켜면 `DB_IN_USE`가 났다.** 재현이 들쭉날쭉해서
 * "가끔 안 열린다"로만 보이는 부류다.
 *
 * `preventDefault`로 종료를 한 번 막고, 다 기다린 뒤 스스로 다시 부른다.
 * `quitting` 깃발이 없으면 두 번째 `quit()`이 또 여기로 들어와 영영 못 나간다
 */
let quitting = false;
app.on("before-quit", (event) => {
  if (quitting || (!backend && probes.size === 0)) return;
  event.preventDefault();
  quitting = true;
  /*
   * 시험용도 같이 내린다 (2026-10-25). 예전엔 본 서버만 봐서, 세이브를 붓는 중에 닫으면 시험용이 그냥 잘려
   * 반쪽 세이브가 남았다. 내린 뒤의 반쪽 폴더는 `.partial` 표시가 있어 다음 기동이 치운다
   */
  Promise.allSettled([stopBackend(), ...[...probes].map((p) => p.stop())])
    .finally(() => app.quit());
});

/**
 * 최후 방어선. `before-quit`을 안 거치는 종료(크래시, 터미널의 Ctrl+C)에서 고아 서버가
 * 남지 않게 한다. (서버도 부모 pid를 감시하다 사라지면 스스로 내려간다 — `server/src/main.ts`)
 *
 * ⚠️ **`exit` 핸들러에서는 동기 코드만 돈다** — `stopBackend`의 기다리는 부분은 여기서
 * 절대 실행되지 않는다. 그래도 `kill`은 동기라 신호는 나간다. 기다리는 건 위가 맡는다
 */
process.on("exit", () => {
  if (backend) {
    try { backend.kill("SIGTERM"); } catch { /* 이미 죽었으면 무시 */ }
  }
  for (const probe of probes) {
    try { probe.stop(); } catch { /* 이미 죽었으면 무시 */ }
  }
});
