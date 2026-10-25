/**
 * 서버 진입점. 일렉트론은 `utilityProcess.fork()`로, 개발·골든 시나리오는 `node`로 띄운다.
 *
 *   잠금 → DB 열기(진단) → 마이그레이션 → 프로필 → 기동 작업 → 리슨 → `STARLOG_READY port=<n>`
 *
 * ⚠️ **닫을 때 반드시 `close()`를 기다린다.** PGlite는 닫혀야 데이터 폴더가 온전하다.
 * 일렉트론은 새 백엔드를 띄우기 전에 옛 것이 완전히 내려가길 `await`한다 — 그 짝이 여기다.
 */
import fs from "fs";
import path from "path";
import { serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import { loadConfig, setConfig, unsafeStartup } from "./config";
import { openDb, setDb, type OpenDb } from "./db/client";
import { migrate } from "./db/migrate";
import { DiagnosticFailure, classify, inspectSchema } from "./diagnose";
import { runStartupTasks } from "./startup";
import { ensureMediaDirs } from "./common/storage";
import { createApp } from "./app";
import { setListenPort } from "./http/guard";
import { ensureProfile } from "./domains/member/profile";

type ParentPort = { on(ev: "message", fn: (e: { data: unknown }) => void): void; postMessage(m: unknown): void };
const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;

function emit(msg: Record<string, unknown>) {
  if (parentPort) parentPort.postMessage(msg);
}

/*
 * 종료 요청은 **기동 첫 줄부터** 받는다. DB를 여는 도중에 일렉트론이 "내려가라"고 하면
 * (빠르게 다른 세이브파일을 고른 경우) 그 요청이 묻히면 안 된다 — 묻히면 일렉트론은
 * 25초를 기다렸다 강제로 죽이고, 그 사이 세이브파일 잠금이 그대로 남는다.
 *
 * ⚠️ 윈도우에서 `utilityProcess.kill()`은 TerminateProcess(강제)다. PGlite가 닫힐 틈이 없다.
 * 그래서 일렉트론은 정상 종료를 **메시지**로 보낸다. 신호(SIGTERM)는 개발·골든 시나리오용
 */
let shutdownRequested: string | null = null;
let shutdownNow: ((why: string) => void) | null = null;
function requestShutdown(why: string) {
  if (shutdownNow) shutdownNow(why);
  else shutdownRequested = why;
}
process.on("SIGTERM", () => requestShutdown("SIGTERM"));
process.on("SIGINT", () => requestShutdown("SIGINT"));
parentPort?.on("message", (e) => { if ((e.data as { type?: string })?.type === "shutdown") requestShutdown("parent"); });
/*
 * 일렉트론 37부터 utilityProcess는 처리 안 된 거부에 **경고만 하고 계속 돈다** (Node는 죽는다).
 * 반쯤 고장 난 채 세이브파일 잠금을 쥐고 사는 것보다 죽어서 "서버가 멈췄다"로 드러나는 게 낫다 —
 * 개발(`npm run dev`)·골든과 같은 동작으로 맞춘다
 */
process.on("unhandledRejection", (e) => {
  console.error("처리 안 된 거부", e);
  process.exit(1);
});

/**
 * 로컬 세이브파일 잠금. **두 프로세스가 같은 PGlite 폴더를 열면 망가진다** — PGlite엔 파일 잠금이
 * 없어서 직접 건다(`DB_IN_USE`). 살아 있는 pid가 쥐고 있으면 거절한다.
 * 죽은 pid의 잠금(강제 종료 흔적)은 지우고 다시 잡는다.
 * 만들기는 `wx`(있으면 실패)다 — 읽고 나서 쓰면 그 틈에 둘이 동시에 "비었다"고 보고 둘 다 연다
 */
function lock(dir: string): () => void {
  // 폴더 **바깥**에 둔다 — 안에 두면 세이브파일 백업(`desktop/tarball.js`가 폴더를 묶는다)에 딸려 들어가 되살릴 때 남의 pid를 들고 온다
  fs.mkdirSync(path.dirname(path.resolve(dir)), { recursive: true });
  const file = path.resolve(dir) + ".lock";
  for (let attempt = 0; ; attempt++) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: "wx" });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST" || attempt > 0) throw e;
    }
    let pid = 0;
    try { pid = Number(fs.readFileSync(file, "utf8").trim()); } catch { /* 그사이 사라졌다 — 다시 잡는다 */ }
    if (pid && pid !== process.pid && alive(pid)) throw new DiagnosticFailure("DB_IN_USE");
    try { fs.unlinkSync(file); } catch { /* 이미 없다 */ }
  }
  return () => { try { if (fs.readFileSync(file, "utf8").trim() === String(process.pid)) fs.unlinkSync(file); } catch { /* 이미 없다 */ } };
}

/** 기동이 중간에 실패해도 잠금은 푼다 — 남기면 pid가 재사용됐을 때 가짜 `DB_IN_USE`가 난다 */
let unlock: () => void = () => {};

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; }
}

async function open(cfg: ReturnType<typeof loadConfig>): Promise<OpenDb> {
  let opened: OpenDb;
  try {
    opened = await openDb(cfg.db);
    if (cfg.db.kind === "postgres") await opened.db.execute(sql`select 1`);
  } catch (e) {
    if (e instanceof DiagnosticFailure) throw e;
    // 폴더가 있는데 못 열면 깨진 것 (잘린 세이브파일)
    if (cfg.db.kind === "pglite" && !cfg.db.dir.startsWith("memory://") && fs.existsSync(path.join(cfg.db.dir, "PG_VERSION"))) throw new DiagnosticFailure("DB_CORRUPTED", e);
    throw new DiagnosticFailure(classify(e), e);
  }
  const problem = await inspectSchema(opened.db).catch((e) => { throw new DiagnosticFailure(classify(e), e); });
  if (problem) { await opened.close().catch(() => {}); throw new DiagnosticFailure(problem); }
  return opened;
}

/** 종료 때 처리 중인 응답을 기다려 주는 시간. 일렉트론의 강제 종료(25초)보다 한참 짧게 */
const SHUTDOWN_GRACE_MS = 3000;

async function main() {
  const cfg = loadConfig();
  const unsafe = unsafeStartup(cfg);
  if (unsafe) throw new DiagnosticFailure(unsafe);
  setConfig(cfg);
  // `memory://`는 연결 시험용 일회성 DB다 — 잠글 파일이 없다
  if (cfg.db.kind === "pglite" && !cfg.db.dir.startsWith("memory://")) unlock = lock(cfg.db.dir);

  const opened = await open(cfg);
  setDb(opened);
  if (cfg.checkOnly) {
    // 진단은 `open()`에서 끝났다 — 여기서 멈춰야 시험이 대상 DB를 안 바꾼다 (마이그레이션·프로필 시드 전)
    await opened.close().catch(() => {});
    unlock();
    console.log("STARLOG_CHECKED");
    emit({ type: "checked" });
    process.exit(0);
  }
  if (shutdownRequested) {
    // 여는 도중에 내려가라는 요청이 왔다 — 마이그레이션도 리슨도 하지 않고 곱게 닫는다
    await opened.close().catch(() => {});
    unlock();
    emit({ type: "closed" });
    process.exit(0);
  }
  const { applied } = await migrate(opened);
  if (applied.length) console.log(`마이그레이션 적용: V${applied.join(", V")}`);
  // 빈 DB의 첫 기동이면 프로필 한 행 + 기본 선택지. 요청보다 먼저 있어야 한다 (요청은 읽기만 한다)
  await ensureProfile();
  /*
   * 미디어 폴더(covers/·media/)를 기동 때 만든다. 업로드 시점에 만들면
   * **권한 문제를 파일을 받은 뒤에야 안다.** 못 쓰는 곳이면 여기서 터져 기동 실패로 드러나야 한다
   */
  ensureMediaDirs();
  await runStartupTasks();

  const app = createApp({ staticDir: cfg.staticDir });
  const server = serve({ fetch: app.fetch, port: cfg.port, hostname: cfg.host }, (info) => {
    setListenPort(info.port);
    console.log(`STARLOG_READY port=${info.port}`);
    emit({ type: "ready", port: info.port });
  });

  let closing = false;
  const shutdown = async (why: string) => {
    if (closing) return;
    closing = true;
    console.log(`종료 (${why})`);
    /*
     * `close()`는 처리 중인 연결이 끝날 때까지 기다린다 — 영상 Range 스트리밍 하나가 몇 분씩 잡고 있으면
     * DB를 못 닫은 채 일렉트론의 강제 종료(25초)를 맞는다. 놀고 있는 연결은 바로 끊고, 조금 기다려도 남으면 다 끊는다
     */
    const http = server as unknown as { closeIdleConnections?: () => void; closeAllConnections?: () => void };
    const closed = new Promise<void>((r) => server.close(() => r()));
    http.closeIdleConnections?.();
    const late = await Promise.race([closed.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), SHUTDOWN_GRACE_MS).unref())]);
    if (late) {
      console.log("응답 중인 연결을 끊는다");
      http.closeAllConnections?.();
      await closed;
    }
    await opened.close().catch((e) => console.error("DB 닫기 실패", e));
    unlock();
    emit({ type: "closed" });
    process.exit(0);
  };
  shutdownNow = (why) => void shutdown(why);
  if (shutdownRequested) void shutdown(shutdownRequested);

  /*
   * 부모 감시 — 일렉트론이 강제 종료되면 고아로 살아남아 세이브파일을
   * 쥔다. 그러면 다음 실행의 자동 백업이 쓰는 중인 폴더를 복사해 찢어진 백업을 남긴다
   */
  if (parentPort || process.env.STARLOG_PARENT_WATCH === "true") {
    const ppid = process.ppid;
    setInterval(() => { if (!alive(ppid)) void shutdown("부모 사라짐"); }, 2000).unref();
  }
}

main().catch((e) => {
  unlock();
  if (e instanceof DiagnosticFailure) {
    console.log(e.message);
    if (e.reason) console.error(e.reason);
    emit({ type: "diagnostic", code: e.diagnostic });
    process.exit(e.exitCode);
  }
  console.error("기동 실패", e);
  emit({ type: "diagnostic", code: "DB_UNKNOWN_ERROR" });
  process.exit(1);
});
