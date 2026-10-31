/**
 * 회귀 테스트 장치 — 시나리오(요청 목록)를 TS 서버에 보내고 **녹화본(골든)**과 대조한다.
 *
 *   npx tsx test/harness/run.ts test/scenarios/<도메인>.json            # 녹화본과 대조 (몇 초)
 *   npx tsx test/harness/run.ts test/scenarios/<도메인>.json --update   # 의도한 동작 변경 뒤 다시 녹화
 *   … --only <이름 일부>  /  --keep (작업 폴더·서버 로그 남김)
 *
 * ## 내력
 *
 * v2 이전(2026-10-24) 동안은 **자바 서버(정답지)와 TS를 나란히 띄워** 같은 요청의 응답·DB·파일을
 * 대조했다 (도메인 전부 diff 0). 자바를 지우기 직전에 자바 쪽 결과를 녹화해 둔 게 `test/golden/`이다.
 * 그래서 녹화본의 `recordedFrom: "java"`는 "자바와 같다고 확인된 동작"이라는 뜻이다.
 * `--update`로 다시 녹화하면 `"ts"`가 된다 — **동작을 일부러 바꾼 뒤에만.**
 *
 * ## 대조하는 것
 *   1. 응답마다 — 상태코드, Location 헤더, 본문(JSON은 구조 비교 / 그 외는 해시)
 *   2. 끝나고 — **DB에서 바뀐 행**(시작 픽스처 대비), 데이터 루트 파일 트리
 *
 * 정규화: 숫자는 값으로(`12000.00` = `12000`), 실행 중 생긴 시각은 `<NOW>`(실행 시작 ~ 지금+1분, 주소의 `?v=<ms>`도),
 * 실행한 날의 날짜는 `<TODAY>`. `updated_at`만 다른 것도 실패로 센다. 녹화본 단계 수가 시나리오와 다르면 실패.
 *
 * ## 픽스처 (전부 로컬 전용 — 실데이터다)
 *   real   `docs/backup-*-neon/`(Neon JSON 백업)에서 만든다 → `server/.dev/fixture`
 *   fresh  프로필 + 기본 카탈로그만 → `server/.dev/fixture-fresh`  (시나리오 `"fixture": "fresh"`)
 *   없으면 처음 돌릴 때 만든다. `HARNESS_FIXTURE`로 덮을 수 있다.
 *   ⚠️ 녹화본(`test/golden/`)도 실데이터가 들어 있어 gitignore다 — 저장소가 공개다
 */
import { spawn, spawnSync, type ChildProcess } from "child_process";
import crypto from "crypto";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { openDb } from "../../src/db/client";
import { migrate } from "../../src/db/migrate";

// ───────────── 시나리오 형식 ─────────────
interface Step {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;                       // `${변수}` 치환
  body?: unknown;                     // JSON. 문자열 안의 `${변수}`도 치환
  rawBody?: string;                   // 깨진 JSON 시험용
  multipart?: Record<string, string | { file: string; filename?: string; type?: string }>;
  headers?: Record<string, string>;
  /**
   * API 토큰을 어떻게 싣나 (운영 프로필 시나리오만 — 장치가 서버마다 새 토큰을 넣는다).
   * 기본은 `X-Starlog-Token` 머리글. `none` 안 싣기 / `wrong` 틀린 값 / `query` 머리글 대신 `?t=`
   */
  auth?: "none" | "wrong" | "query";
  save?: Record<string, string>;      // { 변수: "a.b.0.c" } — 응답 JSON 경로 (자바 쪽 값으로 저장)
  ignore?: string[];                  // 이 단계 본문에서 무시할 경로 (예: "items.*.coverUrl") — 남발 금지, 이유를 시나리오 note에
  note?: string;
}
interface Scenario {
  name: string;
  steps: Step[];
  /** 서버에 넣을 환경변수 — 예: `{"STARLOG_PROFILE": "test", "STARLOG_THUMBNAILER": "copy"}` */
  env?: Record<string, string>;
  /** 서버의 "오늘"을 고정 — `YYYY-MM-DD`. dev·test 프로필 시나리오 전용(`STARLOG_TEST_TODAY`). 달력에 따라 변하는 값(구독 누적 지출)용 */
  today?: string;
  /** 시작 DB. 기본 `real`(실데이터) */
  fixture?: "real" | "fresh";
  /** 빈 DB(스키마만)에서 시작 */
  emptyDb?: boolean;
  /**
   * 서버를 띄우기 전에 픽스처 복사본에 직접 넣을 SQL (최신 마이그레이션까지 올린 뒤, 시작 상태를 뜨기 전).
   * API로는 못 만드는 행용 — homeops가 쓰는 `homeops_play_log`처럼 STARLOG가 쓰지 않는 표
   */
  sql?: string[];
}

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRATCH = process.env.HARNESS_SCRATCH ?? path.join(os.tmpdir(), "starlog-harness");
const DEV = path.join(ROOT, ".dev");

const args = process.argv.slice(2);
const scenarioPath = args.find(a => a.endsWith(".json"));
const keep = args.includes("--keep");
const update = args.includes("--update");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
if (!scenarioPath) { console.error("사용법: run.ts <scenario.json> [--update] [--keep] [--only 이름]"); process.exit(2); }

/** 가장 최근 Neon 백업 폴더 (`docs/backup-YYYY-MM-DD-neon`) */
function latestBackup(): string {
  const docs = path.resolve(ROOT, "../docs");
  const found = fs.existsSync(docs) ? fs.readdirSync(docs).filter(d => /^backup-.*-neon$/.test(d)).sort() : [];
  if (!found.length) throw new Error("docs/backup-*-neon 이 없다 — 픽스처를 만들 실데이터 백업이 필요하다");
  return path.join(docs, found.at(-1)!);
}

/** 픽스처 폴더. 없으면 만든다 */
function fixture(kind: "real" | "fresh"): string {
  if (process.env.HARNESS_FIXTURE) return process.env.HARNESS_FIXTURE;
  const dir = path.join(DEV, kind === "fresh" ? "fixture-fresh" : "fixture");
  if (fs.existsSync(path.join(dir, "PG_VERSION"))) return dir;
  console.log(`픽스처 만드는 중 → ${path.relative(ROOT, dir)}`);
  fs.mkdirSync(DEV, { recursive: true });   // PGlite는 상위 폴더까지는 안 만든다
  const tsx = path.join(ROOT, "node_modules/.bin/tsx");
  const r = kind === "fresh"
    ? spawnSync(tsx, [path.join(ROOT, "scripts/build-fresh-fixture.ts"), dir], { stdio: "inherit" })
    : spawnSync(tsx, [path.join(ROOT, "scripts/build-fixture.ts"), path.join(ROOT, "migrations"), latestBackup(), dir, "--with-flyway-history"], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("픽스처를 만들지 못했다");
  return dir;
}

// ───────────── 준비 ─────────────
const freePort = () => new Promise<number>((res) => {
  const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); });
});

function waitFor(proc: ChildProcess, log: string[], re: RegExp, ms: number, label: string) {
  return new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${label} 기동 시간 초과\n${log.slice(-30).join("")}`)), ms);
    const check = () => { if (re.test(log.join(""))) { clearTimeout(t); res(); } };
    proc.stdout?.on("data", (d) => { log.push(String(d)); check(); });
    proc.stderr?.on("data", (d) => { log.push(String(d)); check(); });
    proc.on("exit", (code) => { clearTimeout(t); rej(new Error(`${label}가 죽었다 (code=${code})\n${log.slice(-40).join("")}`)); });
  });
}

function stop(proc: ChildProcess, ms = 25000) {
  return new Promise<void>((res) => {
    if (proc.exitCode !== null) return res();
    const t = setTimeout(() => { proc.kill("SIGKILL"); }, ms);
    proc.once("exit", () => { clearTimeout(t); res(); });
    proc.kill("SIGTERM");
  });
}

// ───────────── 정규화·비교 ─────────────
const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
let runStartKst = "";   // "YYYY-MM-DD HH:mm:ss" (KST 벽시계) — 이 이후 시각은 <NOW>
let runStartMs = 0;
/**
 * <NOW>의 위쪽 끝 — 정규화하는 순간 + 여유. 위가 열려 있으면 "미래로 틀어진 시각"(이중 변환으로 +9시간 같은)이
 * <NOW>로 덮여 안 보인다. 실행 중에 생긴 시각은 정규화하는 순간보다 늦을 수 없다
 */
const NOW_SLACK_MS = 60_000;

function kstNow(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

const UUID_SRC = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const COVER_NAME_RE = new RegExp(`^${UUID_SRC}\\.(jpg|jpeg|png|webp)$`);
const COVER_V_RE = new RegExp(`([?&]v=)${UUID_SRC}\\.(jpg|jpeg|png|webp)\\b`, "g");

function normScalar(v: unknown): unknown {
  // 서버가 "오늘"로 채운 날짜(플레이 기록의 기본 날짜 등) — 녹화한 날과 다음 날 결과가 갈리지 않게
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && v === runStartKst.slice(0, 10)) return "<TODAY>";
  if (typeof v === "string" && TS_RE.test(v)) {
    // 실행 중에 생긴 시각만 <NOW>. 오프셋이 붙은 것(스프링 오류 본문 timestamp·파일 수정 시각)은 값으로 본다
    if (/Z$|[+-]\d{2}:\d{2}$/.test(v)) {
      const ms = Date.parse(v);
      return ms >= runStartMs - 1000 && ms <= Date.now() + NOW_SLACK_MS ? "<NOW>" : v;
    }
    const s = v.replace("T", " ").slice(0, 19);
    const cap = kstNow(new Date(Date.now() + NOW_SLACK_MS));
    if (s.length >= 16 && s >= runStartKst.slice(0, s.length) && s <= cap.slice(0, s.length)) return "<NOW>";
  }
  // LOCAL·DB 커버 이름(`<uuid>.<ext>`)은 올릴 때마다 새로 짓는다 — 이름 하나짜리 값과 주소의 `?v=`만 (키 경로 속 uuid는 그대로 본다)
  if (typeof v === "string" && COVER_NAME_RE.test(v)) return v.replace(COVER_NAME_RE, "<UUID>.$1");
  if (typeof v === "string" && v.includes("v=")) { const r = v.replace(COVER_V_RE, "$1<UUID>.$2"); if (r !== v) return r; }
  // 파일 주소의 `?v=<수정 시각 ms>` — 실행 중에 만든 파일이면 실행마다 다르다
  if (typeof v === "string" && /[?&]v=\d{13}\b/.test(v)) {
    return v.replace(/([?&]v=)(\d{13})\b/g, (m, k: string, n: string) =>
      (Number(n) >= runStartMs - 1000 && Number(n) <= Date.now() + NOW_SLACK_MS ? `${k}<NOW>` : m));
  }
  return v;
}

function pathMatch(pattern: string, p: string) {
  const a = pattern.split("."), b = p.split(".");
  return a.length === b.length && a.every((x, i) => x === "*" || x === b[i]);
}

function diffJson(a: unknown, b: unknown, at: string, out: string[], ignore: string[]) {
  if (ignore.some(g => pathMatch(g, at.replace(/^\$\.?/, "")))) return;
  if (out.length > 40) return;
  a = normScalar(a); b = normScalar(b);
  if (typeof a === "number" && typeof b === "number") { if (Math.abs(a - b) > 1e-9) out.push(`${at}: 자바=${a} TS=${b}`); return; }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (a !== b) out.push(`${at}: 자바=${JSON.stringify(a)?.slice(0, 200)} TS=${JSON.stringify(b)?.slice(0, 200)}`);
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) { out.push(`${at}: 배열/객체 다름`); return; }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${at}: 길이 자바=${a.length} TS=${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diffJson(a[i], b[i], `${at}.${i}`, out, ignore);
    return;
  }
  const ao = a as Record<string, unknown>, bo = b as Record<string, unknown>;
  for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
    if (!(k in ao)) { out.push(`${at}.${k}: 자바에 없음 (TS=${JSON.stringify(bo[k])?.slice(0, 120)})`); continue; }
    if (!(k in bo)) { out.push(`${at}.${k}: TS에 없음 (자바=${JSON.stringify(ao[k])?.slice(0, 120)})`); continue; }
    diffJson(ao[k], bo[k], `${at}.${k}`, out, ignore);
  }
}

function getPath(obj: unknown, p: string): unknown {
  return p.split(".").reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

function subst<T>(v: T, vars: Record<string, unknown>): T {
  if (typeof v === "string") {
    const whole = /^\$\{(\w+)\}$/.exec(v);
    if (whole) return (vars[whole[1]!] ?? v) as T;
    return v.replace(/\$\{(\w+)\}/g, (_, k) => String(vars[k] ?? `\${${k}}`)) as T;
  }
  if (Array.isArray(v)) return v.map(x => subst(x, vars)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, subst(x, vars)])) as T;
  return v;
}

// ───────────── 요청 ─────────────
interface Resp { status: number; location: string | null; type: string; json?: unknown; hash?: string; text?: string }

async function send(base: string, step: Step, vars: Record<string, unknown>, token: string | null): Promise<Resp> {
  const headers: Record<string, string> = { "Accept-Language": "ko-KR", ...(step.headers ?? {}) };
  let url = base + subst(step.path, vars);
  if (token !== null) {
    if (step.auth === "query") url += (url.includes("?") ? "&" : "?") + "t=" + token;
    else if (step.auth === "wrong") headers["X-Starlog-Token"] = "x".repeat(token.length);
    else if (step.auth !== "none") headers["X-Starlog-Token"] = token;
  }
  let body: RequestInit["body"];
  if (step.rawBody !== undefined) { body = step.rawBody; headers["Content-Type"] ??= "application/json"; }
  else if (step.body !== undefined) { body = JSON.stringify(subst(step.body, vars)); headers["Content-Type"] ??= "application/json"; }
  else if (step.multipart) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(step.multipart)) {
      if (typeof v === "string") fd.append(k, subst(v, vars));
      else {
        const file = path.resolve(path.dirname(scenarioPath!), v.file);
        fd.append(k, new Blob([fs.readFileSync(file)], { type: v.type ?? "application/octet-stream" }), v.filename ?? path.basename(file));
      }
    }
    body = fd;
  }
  const res = await fetch(url, { method: step.method, headers, body, redirect: "manual" });
  const type = res.headers.get("content-type") ?? "";
  const buf = Buffer.from(await res.arrayBuffer());
  const r: Resp = { status: res.status, location: res.headers.get("location"), type: type.split(";")[0]!.trim() };
  if (buf.length === 0) return r;
  if (r.type.includes("json")) { try { r.json = JSON.parse(buf.toString("utf8")); } catch { r.text = buf.toString("utf8").slice(0, 300); } }
  else r.hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16) + ` (${buf.length}B)`;
  return r;
}

// ───────────── DB·파일 덤프 ─────────────
async function dumpDbRaw(dir: string) {
  const parsers = Object.fromEntries([1082, 1083, 1114, 1184, 1266, 1700].map(o => [o, (v: string) => v]));
  const db = await PGlite.create(dir, { parsers });
  const tables = (await db.query<{ t: string }>(
    `select table_name t from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> 'flyway_schema_history' order by 1`)).rows.map(r => r.t);
  const out: Record<string, Record<string, unknown>[]> = {};
  // bytea(커버 바이트)는 해시로 — 그대로 두면 JSON이 바이트마다 칸 하나인 객체가 된다
  const bytes = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) =>
    [k, v instanceof Uint8Array ? `sha256:${crypto.createHash("sha256").update(v).digest("hex").slice(0, 16)} (${v.length}B)` : v]));
  for (const t of tables) out[t] = (await db.query<Record<string, unknown>>(`select * from "${t}"`)).rows.map(bytes);
  await db.close();
  return out;
}

/**
 * 서버가 기동 때 지울 API 호출 기록(30일 지남)을 **미리** 지운다 — 안 그러면 날이 갈수록 픽스처의 옛 행이 하나씩
 * "지운 행"으로 녹화본 diff에 끼어들어 모든 시나리오가 어느 날 갑자기 깨진다. 1시간 여유를 둬서 서버 쪽 기준과 안 겹친다.
 * 이 표의 날짜에 묶인 값(오늘·이번 달 사용량)은 `system` 시나리오가 자기 행을 넣어서 본다
 */
async function pruneOldApiCalls(dir: string) {
  const threshold = kstNow(new Date(Date.now() - 30 * 86_400_000 + 3_600_000));
  const db = await PGlite.create(dir);
  await db.query(`delete from api_call_log where called_at < $1`, [threshold]);
  await db.close();
}

function rowKey(r: Record<string, unknown>) {
  return "id" in r ? String(r.id) : JSON.stringify(Object.entries(r).filter(([k]) => !/_at$/.test(k)).sort());
}

// ───────────── 골든 ─────────────
interface GoldenStep { name: string; status: number; location: string | null; json?: unknown; hash?: string; text?: string }
type Rows = Record<string, Record<string, unknown>[]>;
interface Changes { [table: string]: { added: Record<string, unknown>[]; removed: string[]; changed: { key: string; cols: Record<string, unknown> }[] } }
interface Golden { scenario: string; recordedFrom: "java" | "ts"; recordedAt: string; steps: GoldenStep[]; db: Changes; files: Record<string, string> }

const goldenPath = (name: string) => path.join(ROOT, "test/golden", `${name}.json`);

function normRow(r: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normScalar(v)]));
}

/** 시작 DB 대비 바뀐 행 — 녹화본에 담는 건 이것뿐 */
function changes(base: Rows, after: Rows): Changes {
  const out: Changes = {};
  for (const t of [...new Set([...Object.keys(base), ...Object.keys(after)])].sort()) {
    const rb = new Map((base[t] ?? []).map(r => [rowKey(r), r])), ra = new Map((after[t] ?? []).map(r => [rowKey(r), r]));
    const added: Record<string, unknown>[] = [], removed: string[] = [], changed: { key: string; cols: Record<string, unknown> }[] = [];
    for (const [k, r] of ra) {
      const b = rb.get(k);
      if (!b) { added.push(normRow(r)); continue; }
      const cols: Record<string, unknown> = {};
      for (const c of Object.keys(r)) if (JSON.stringify(b[c]) !== JSON.stringify(r[c])) cols[c] = normScalar(r[c]);
      if (Object.keys(cols).length) changed.push({ key: k, cols });
    }
    for (const k of rb.keys()) if (!ra.has(k)) removed.push(k);
    if (added.length || removed.length || changed.length) {
      added.sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
      out[t] = { added, removed: removed.sort(), changed: changed.sort((x, y) => x.key.localeCompare(y.key)) };
    }
  }
  return out;
}

/** 녹화본의 바뀐 행 vs 지금 바뀐 행. `updated_at`만 다른 건 따로 센다 (둘 다 실패) */
function diffChanges(expected: Changes, actual: Changes) {
  const errors: string[] = [], warnings: string[] = [];
  const strip = (c: Changes) => JSON.stringify(c, (k, v) => (k === "updated_at" ? undefined : v));
  for (const t of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const e = expected[t], a = actual[t];
    if (JSON.stringify(e) === JSON.stringify(a)) continue;
    const se = strip({ [t]: e! ?? null }), sa = strip({ [t]: a! ?? null });
    const msg = `${t}: 녹화=${JSON.stringify(e ?? null).slice(0, 300)}\n      TS=${JSON.stringify(a ?? null).slice(0, 300)}`;
    (se === sa ? warnings : errors).push(msg);
  }
  return { errors, warnings };
}

function fileTree(root: string) {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(root, p)] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 12);
    }
  };
  walk(root);
  return out;
}

// ───────────── 실행 ─────────────
async function main() {
  const scenario: Scenario = JSON.parse(fs.readFileSync(scenarioPath!, "utf8"));
  const golden: Golden | null = update ? null : (() => {
    const p = goldenPath(scenario.name);
    if (!fs.existsSync(p)) throw new Error(`녹화본이 없다: ${path.relative(ROOT, p)} — 처음이면 --update로 녹화한다`);
    return JSON.parse(fs.readFileSync(p, "utf8")) as Golden;
  })();

  fs.mkdirSync(path.dirname(SCRATCH), { recursive: true });
  const work = fs.mkdtempSync(SCRATCH + "-");
  const dbDir = path.join(work, "db"), dataDir = path.join(work, "data");
  if (scenario.emptyDb) {
    const o = await openDb({ kind: "pglite", dir: dbDir }); await migrate(o); await o.close();
  } else {
    // ⚠️ 픽스처는 **복사해서** 연다 — 원본을 열면 PGlite가 파일을 건드린다
    fs.cpSync(fixture(scenario.fixture ?? "real"), dbDir, { recursive: true });
  }
  if (!scenario.emptyDb && (scenario.fixture ?? "real") === "real") await pruneOldApiCalls(dbDir);
  if (scenario.sql?.length) {
    const o = await openDb({ kind: "pglite", dir: dbDir });
    await migrate(o);
    await o.execScript(scenario.sql.join(";\n"));
    await o.close();
  }
  fs.mkdirSync(dataDir);
  // 시작 상태 — 녹화본은 이것 대비 바뀐 행만 담는다
  const base = await dumpDbRaw(dbDir);

  const port = await freePort();
  runStartMs = Date.now();
  runStartKst = kstNow(new Date(runStartMs));
  /*
   * 운영 프로필 그대로 띄운다 — 토큰이 없으면 서버가 기동을 거절하므로 일렉트론처럼 매번 새로 만들어 넣는다.
   * dev·test 프로필 시나리오는 거꾸로 토큰이 있으면 거절된다. 밖의 환경변수가 섞이지 않게 둘 다 지우고 시작
   */
  const { STARLOG_API_TOKEN: _t, STARLOG_PROFILE: _p, ...serverEnv } = process.env;
  const devProfile = ["dev", "test"].includes(scenario.env?.STARLOG_PROFILE ?? "");
  const token = devProfile ? null : crypto.randomBytes(32).toString("hex");
  const log: string[] = [];
  const server = spawn(path.join(ROOT, "node_modules/.bin/tsx"), [path.join(ROOT, "src/main.ts")],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...serverEnv, STARLOG_DB_DIR: dbDir, STARLOG_PORT: String(port), STARLOG_DATA_ROOT: dataDir, ...(scenario.env ?? {}), ...(scenario.today ? { STARLOG_TEST_TODAY: scenario.today } : {}), ...(token ? { STARLOG_API_TOKEN: token } : {}) } });
  try {
    await waitFor(server, log, /STARLOG_READY/, 30000, "서버");
  } catch (e) {
    await stop(server);
    throw e;
  }

  const base_ = `http://127.0.0.1:${port}`;
  const vars: Record<string, unknown> = {};
  let fails = 0, passes = 0;
  const recorded: GoldenStep[] = [];
  for (const [i, step] of scenario.steps.entries()) {
    if (only && !step.name.includes(only)) continue;
    const got = await send(base_, step, vars, token);
    recorded.push({ name: step.name, status: got.status, location: got.location,
      ...(got.json !== undefined ? { json: JSON.parse(JSON.stringify(got.json, (_k, v) => normScalar(v))) } : {}),
      ...(got.hash !== undefined ? { hash: got.hash } : {}), ...(got.text !== undefined ? { text: got.text } : {}) });
    if (!golden) {
      if (step.save) for (const [k, p] of Object.entries(step.save)) vars[k] = getPath(got.json, p);
      console.log(`· ${step.name}  [${got.status}]`);
      continue;
    }
    const want = golden.steps[i];
    if (!want || want.name !== step.name) throw new Error(`녹화본과 시나리오가 어긋난다 (${i}번 단계: ${step.name}) — 시나리오를 바꿨으면 --update`);
    const problems: string[] = [];
    if (want.status !== got.status) problems.push(`상태: 녹화=${want.status} 지금=${got.status}`);
    if ((want.location ?? null) !== (got.location ?? null)) problems.push(`Location: 녹화=${want.location} 지금=${got.location}`);
    if (want.json !== undefined || got.json !== undefined) diffJson(want.json, got.json, "$", problems, step.ignore ?? []);
    else if (want.hash !== got.hash) problems.push(`본문: 녹화=${want.hash ?? want.text ?? "(없음)"} 지금=${got.hash ?? got.text ?? "(없음)"}`);
    /*
     * 변수는 **지금 응답**에서 꺼낸다. 녹화본 값은 시각이 `<NOW>`로 정규화돼 있어서 그대로 다음 요청에
     * 실으면 본문이 깨진다 (내보낸 덤프의 exportedAt을 덮어쓰기에 다시 싣는 member 시나리오에서 밟았다).
     * 지금 응답이 녹화본과 다르면 이 단계에서 이미 차이로 잡힌다
     */
    if (step.save) for (const [k, p] of Object.entries(step.save)) vars[k] = getPath(got.json, p);
    if (problems.length) {
      fails++;
      console.log(`✗ ${step.name}  [${step.method} ${subst(step.path, vars)}]`);
      for (const p of problems.slice(0, 15)) console.log(`    ${p}`);
      if (problems.length > 15) console.log(`    … 외 ${problems.length - 15}건`);
    } else {
      passes++;
      if (!process.env.HARNESS_QUIET) console.log(`✓ ${step.name}  [${got.status}]`);
    }
  }

  await stop(server);
  const after = await dumpDbRaw(dbDir);
  const now = changes(base, after);
  const files = fileTree(dataDir);
  fs.writeFileSync(path.join(work, "server.log"), log.join(""));

  if (!golden) {
    if (only) { console.log("\n--only로는 녹화하지 않는다"); process.exit(2); }
    const g: Golden = { scenario: scenario.name, recordedFrom: "ts", recordedAt: kstNow(), steps: recorded, db: now, files };
    fs.mkdirSync(path.dirname(goldenPath(scenario.name)), { recursive: true });
    fs.writeFileSync(goldenPath(scenario.name), JSON.stringify(g, null, 1) + "\n");
    console.log(`\n녹화 → test/golden/${scenario.name}.json (${(fs.statSync(goldenPath(scenario.name)).size / 1024).toFixed(0)}KB)`);
    if (!keep) fs.rmSync(work, { recursive: true, force: true });
    return;
  }

  // 시나리오 끝 단계를 지웠는데 녹화본이 그대로면 단계별 대조로는 안 보인다 (`--only`는 일부만 돈다)
  if (!only && golden.steps.length !== scenario.steps.length) {
    console.log(`✗ 녹화본 단계 ${golden.steps.length}개 ≠ 시나리오 ${scenario.steps.length}개 — 시나리오를 바꿨으면 --update`);
    fails++;
  }
  const { errors, warnings } = diffChanges(golden.db, now);
  const fileDiffs = [...new Set([...Object.keys(golden.files), ...Object.keys(files)])].filter(k => golden.files[k] !== files[k])
    .map(k => `${k}: 녹화=${golden.files[k] ?? "(없음)"} 지금=${files[k] ?? "(없음)"}`);

  console.log(`\n── 응답 ${passes} 통과 / ${fails} 실패`);
  console.log(`── DB ${errors.length ? `${errors.length}건 다름` : "같음"}${warnings.length ? ` (updated_at만 다름 ${warnings.length}건)` : ""}`);
  for (const e of errors.slice(0, 30)) console.log(`    ${e}`);
  for (const w of warnings.slice(0, 5)) console.log(`    (updated_at) ${w}`);
  console.log(`── 파일 ${fileDiffs.length ? `${fileDiffs.length}건 다름` : "같음"}`);
  for (const f of fileDiffs.slice(0, 20)) console.log(`    ${f}`);

  if (keep) console.log(`\n작업 폴더 유지: ${work}  (server.log · db · data)`);
  else fs.rmSync(work, { recursive: true, force: true });
  // `updated_at`만 다른 것도 실패다 — "값이 바뀌었는데 `updated_at`이 그대로"(원칙 7 위반)가 이것으로만 보인다
  if (fails || errors.length || warnings.length || fileDiffs.length) {
    const errLines = log.join("").split("\n").filter(l => /Error|에러|처리 못 한/.test(l)).slice(0, 10);
    if (errLines.length) console.log(`\n서버 로그의 오류 줄:\n${errLines.join("\n")}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
