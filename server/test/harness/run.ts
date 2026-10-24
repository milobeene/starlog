/**
 * 비교 장치 — 같은 픽스처 위에서 자바(정답지)와 TS에 같은 요청을 보내고 결과를 대조한다.
 *
 *   npx tsx test/harness/run.ts test/scenarios/<도메인>.json [--keep] [--only <이름 일부>]
 *
 * 대조하는 것:
 *   1. 응답마다 — 상태코드, Location 헤더, 본문(JSON은 구조 비교 / 그 외는 해시)
 *   2. 끝나고 — **DB 전 테이블**(쓰기 동작의 진짜 검증), 데이터 루트 파일 트리
 *
 * 정규화:
 *   - 숫자는 값으로 (`12000.00` = `12000`)
 *   - 실행 중에 만들어진 시각(시작 시각 이후)은 `<NOW>` — 양쪽 다 "방금"이면 같다
 *   - 스프링 기본 오류 본문의 `timestamp`는 무시
 *   - `updated_at`만 다른 건 경고로 따로 센다 (값이 안 바뀐 수정에서 하이버네이트는 안 건드린다)
 *
 * 필요한 것: 픽스처(`HARNESS_FIXTURE`, 기본은 스크래치 `fx-base`), 자바 jar(`../backend/build/libs/app.jar`)
 *
 * ## 골든 (자바가 사라진 뒤에도 시나리오를 살리는 법)
 *
 *   --record   위와 똑같이 비교하고, **통과하면** 자바 쪽 결과를 `test/golden/<시나리오>.json`에 녹화한다
 *   --golden   자바 없이 TS만 띄워 녹화본과 비교한다 (자바 제거 후의 회귀 테스트)
 *
 * 녹화본에는 응답과 **픽스처 대비 바뀐 행만** 담는다 — 테이블 전체를 담으면 시나리오마다 수백 KB다.
 * 의도해서 동작을 바꿨으면(자바 버그 수정 등) 고친 뒤 `--golden-update`로 TS 결과를 새 녹화본으로 쓴다
 */
import { spawn, type ChildProcess } from "child_process";
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
  save?: Record<string, string>;      // { 변수: "a.b.0.c" } — 응답 JSON 경로 (자바 쪽 값으로 저장)
  ignore?: string[];                  // 이 단계 본문에서 무시할 경로 (예: "items.*.coverUrl") — 남발 금지, 이유를 시나리오 note에
  note?: string;
}
interface Scenario {
  name: string;
  steps: Step[];
  /**
   * 양쪽 서버에 넣을 환경변수. 값이 `$LOCAL:app.igdb.client-id`처럼 시작하면
   * `backend/src/main/resources/application-local.yml`에서 그 키를 읽어 넣는다 — **비밀값을 시나리오에 적지 않는다**
   */
  env?: Record<string, string>;
  /** 빈 DB에서 시작 — 주인 생성·기본 카탈로그 심기를 대조할 때 */
  emptyDb?: boolean;
}

/** application-local.yml에서 점 경로로 값 하나 — 들여쓰기 기반 단순 파서 (이 파일 모양에만 맞춘다) */
function localYml(key: string): string {
  const file = path.resolve(ROOT, "../backend/src/main/resources/application-local.yml");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const want = key.split(".");
  const stack: { indent: number; name: string }[] = [];
  for (const line of lines) {
    if (/^\s*(#|$)/.test(line)) continue;
    const m = /^(\s*)([\w.-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1]!.length;
    while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
    stack.push({ indent, name: m[2]! });
    if (stack.map(x => x.name).join(".") === want.join(".") && m[3]) return m[3].trim();
  }
  throw new Error(`application-local.yml에 ${key}가 없다`);
}

function resolveEnv(env: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(env ?? {}).map(([k, v]) => [k, v.startsWith("$LOCAL:") ? localYml(v.slice(7)) : v]));
}

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRATCH = process.env.HARNESS_SCRATCH ?? path.join(os.tmpdir(), "starlog-harness");
const FIXTURE = process.env.HARNESS_FIXTURE
  ?? "/private/tmp/claude-502/-Users-milo-projects-Practice-starlog/f498f61d-0a91-4b85-ab79-3f0fa7f29941/scratchpad/fx-base";
const JAR = process.env.HARNESS_JAR ?? path.resolve(ROOT, "../backend/build/libs/app.jar");
const JAVA = process.env.HARNESS_JAVA ?? "java";

const args = process.argv.slice(2);
const scenarioPath = args.find(a => a.endsWith(".json"));
const keep = args.includes("--keep");
const mode: "compare" | "record" | "golden" | "golden-update" =
  args.includes("--golden-update") ? "golden-update" : args.includes("--golden") ? "golden" : args.includes("--record") ? "record" : "compare";
const usesJava = mode === "compare" || mode === "record";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
if (!scenarioPath) { console.error("사용법: run.ts <scenario.json> [--keep] [--only 이름]"); process.exit(2); }

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

function kstNow(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function normScalar(v: unknown): unknown {
  if (typeof v === "string" && TS_RE.test(v)) {
    // 실행 중에 생긴 시각만 <NOW>. UTC 표기(Z)는 스프링 오류 본문 timestamp뿐이라 그것도 <NOW>
    if (/Z$|[+-]\d{2}:\d{2}$/.test(v)) return "<NOW>";
    const s = v.replace("T", " ").slice(0, 19);
    if (s.length >= 16 && s >= runStartKst.slice(0, s.length)) return "<NOW>";
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

async function send(base: string, step: Step, vars: Record<string, unknown>): Promise<Resp> {
  const headers: Record<string, string> = { "Accept-Language": "ko-KR", ...(step.headers ?? {}) };
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
  const res = await fetch(base + subst(step.path, vars), { method: step.method, headers, body, redirect: "manual" });
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
  for (const t of tables) out[t] = (await db.query<Record<string, unknown>>(`select * from "${t}"`)).rows;
  await db.close();
  return out;
}

function rowKey(r: Record<string, unknown>) {
  return "id" in r ? String(r.id) : JSON.stringify(Object.entries(r).filter(([k]) => !/_at$/.test(k)).sort());
}

function diffDbs(a: Record<string, Record<string, unknown>[]>, b: Record<string, Record<string, unknown>[]>) {
  const errors: string[] = [], warnings: string[] = [];
  for (const t of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ra = new Map((a[t] ?? []).map(r => [rowKey(r), r])), rb = new Map((b[t] ?? []).map(r => [rowKey(r), r]));
    for (const k of new Set([...ra.keys(), ...rb.keys()])) {
      const x = ra.get(k), y = rb.get(k);
      if (!x) { errors.push(`${t}[${k}]: TS에만 있음 ${JSON.stringify(y).slice(0, 200)}`); continue; }
      if (!y) { errors.push(`${t}[${k}]: 자바에만 있음 ${JSON.stringify(x).slice(0, 200)}`); continue; }
      for (const col of new Set([...Object.keys(x), ...Object.keys(y)])) {
        const vx = normScalar(x[col]), vy = normScalar(y[col]);
        if (JSON.stringify(vx) === JSON.stringify(vy)) continue;
        const msg = `${t}[${k}].${col}: 자바=${JSON.stringify(vx)?.slice(0, 120)} TS=${JSON.stringify(vy)?.slice(0, 120)}`;
        (col === "updated_at" ? warnings : errors).push(msg);
      }
    }
  }
  return { errors, warnings };
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

/** 녹화본의 바뀐 행 vs 지금 바뀐 행. `updated_at`만 다른 건 경고 */
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
  const work = fs.mkdtempSync(path.join(SCRATCH + "-"));
  const javaDb = path.join(work, "java-db"), tsDb = path.join(work, "ts-db");
  const javaData = path.join(work, "java-data"), tsData = path.join(work, "ts-data");
  const golden: Golden | null = mode === "golden" ? JSON.parse(fs.readFileSync(goldenPath(scenario.name), "utf8")) : null;
  if (scenario.emptyDb) {
    /*
     * 스키마만 있고 행은 없는 DB. 우리 러너로 깐다 — 자바 Flyway가 빈 PGlite에서 직접 돌면
     * 잠금 연결과 작업 연결이 소켓 서버의 세션 하나에 몰려 서로를 기다린다.
     * 이력 행의 체크섬이 Flyway와 같아서 자바도 "이미 적용됨"으로 받아들인다
     */
    for (const d of [javaDb, tsDb]) { const o = await openDb({ kind: "pglite", dir: d }); await migrate(o); await o.close(); }
  } else {
    fs.cpSync(FIXTURE, javaDb, { recursive: true });
    fs.cpSync(FIXTURE, tsDb, { recursive: true });
  }
  fs.mkdirSync(javaData); fs.mkdirSync(tsData);
  // 시작 상태 — 녹화본은 이것 대비 바뀐 행만 담는다
  const base = await dumpDbRaw(tsDb);

  const [pgPort, javaPort, tsPort] = [await freePort(), await freePort(), await freePort()];
  runStartKst = kstNow();
  const scenarioEnv = resolveEnv(scenario.env);

  const pgLog: string[] = [], javaLog: string[] = [], tsLog: string[] = [];
  const noop = { exitCode: 0 } as unknown as ChildProcess;
  const pgsrv = !usesJava ? noop : spawn(path.join(ROOT, "node_modules/.bin/pglite-server"), [`--db=${javaDb}`, `--port=${pgPort}`, "--max-connections=4"], { stdio: ["ignore", "pipe", "pipe"] });
  if (usesJava) await waitFor(pgsrv, pgLog, /listening/, 30000, "pglite-server");

  const java = !usesJava ? noop : spawn(JAVA, ["-jar", JAR, `--server.port=${javaPort}`, "--spring.profiles.active=desktop",
    `--spring.datasource.url=jdbc:postgresql://127.0.0.1:${pgPort}/postgres?sslmode=disable&prepareThreshold=0`,
    "--spring.datasource.driver-class-name=org.postgresql.Driver", "--spring.datasource.hikari.maximum-pool-size=3"],
    { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, SPRING_DATASOURCE_USERNAME: "postgres", SPRING_DATASOURCE_PASSWORD: "postgres", STARLOG_DATA_ROOT: javaData, ...scenarioEnv } });
  const ts = spawn(path.join(ROOT, "node_modules/.bin/tsx"), [path.join(ROOT, "src/main.ts")],
    { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, STARLOG_DB_DIR: tsDb, STARLOG_PORT: String(tsPort), STARLOG_DATA_ROOT: tsData, ...scenarioEnv } });

  try {
    await Promise.all([
      usesJava ? waitFor(java, javaLog, /Started StarlogApplication/, 90000, "자바") : Promise.resolve(),
      waitFor(ts, tsLog, /STARLOG_READY/, 30000, "TS"),
    ]);
  } catch (e) {
    await Promise.all([stop(java), stop(ts), stop(pgsrv)]);
    throw e;
  }

  const javaBase = `http://127.0.0.1:${javaPort}`, tsBase = `http://127.0.0.1:${tsPort}`;
  const vars: Record<string, unknown> = {};
  let fails = 0, passes = 0;
  const recorded: GoldenStep[] = [];
  for (const [i, step] of scenario.steps.entries()) {
    if (only && !step.name.includes(only)) continue;
    let ja: Resp;
    if (golden) {
      const g = golden.steps[i];
      if (!g || g.name !== step.name) throw new Error(`녹화본과 시나리오가 어긋난다 (${i}번 단계: ${step.name}) — 다시 녹화할 것`);
      ja = { status: g.status, location: g.location, type: "", json: g.json, hash: g.hash, text: g.text };
    } else if (mode === "golden-update") {
      ja = await send(tsBase, step, vars);
    } else {
      ja = await send(javaBase, step, vars);
    }
    const tb = mode === "golden-update" ? ja : await send(tsBase, step, vars);
    recorded.push({ name: step.name, status: ja.status, location: ja.location,
      ...(ja.json !== undefined ? { json: JSON.parse(JSON.stringify(ja.json, (_k, v) => normScalar(v))) } : {}),
      ...(ja.hash !== undefined ? { hash: ja.hash } : {}), ...(ja.text !== undefined ? { text: ja.text } : {}) });
    const problems: string[] = [];
    if (ja.status !== tb.status) problems.push(`상태: 자바=${ja.status} TS=${tb.status}`);
    if ((ja.location ?? null) !== (tb.location ?? null)) problems.push(`Location: 자바=${ja.location} TS=${tb.location}`);
    if (ja.json !== undefined || tb.json !== undefined) diffJson(ja.json, tb.json, "$", problems, step.ignore ?? []);
    else if (ja.hash !== tb.hash) problems.push(`본문: 자바=${ja.hash ?? ja.text ?? "(없음)"} TS=${tb.hash ?? tb.text ?? "(없음)"}`);
    if (step.save) for (const [k, p] of Object.entries(step.save)) vars[k] = getPath(ja.json, p);
    if (problems.length) {
      fails++;
      console.log(`✗ ${step.name}  [${step.method} ${subst(step.path, vars)}]`);
      for (const p of problems.slice(0, 15)) console.log(`    ${p}`);
      if (problems.length > 15) console.log(`    … 외 ${problems.length - 15}건`);
    } else {
      passes++;
      console.log(`✓ ${step.name}  [${ja.status}]`);
    }
  }

  await Promise.all([stop(java), stop(ts)]);
  await stop(pgsrv);
  const db = await dumpDbRaw(tsDb);
  const da = usesJava ? await dumpDbRaw(javaDb) : db;
  const tsChanges = changes(base, db);
  const { errors, warnings } = golden ? diffChanges(golden.db, tsChanges) : diffDbs(da, db);
  const fb = fileTree(tsData);
  const fa = golden ? golden.files : usesJava ? fileTree(javaData) : fb;
  const fileDiffs = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter(k => fa[k] !== fb[k])
    .map(k => `${k}: 자바=${fa[k] ?? "(없음)"} TS=${fb[k] ?? "(없음)"}`);

  console.log(`\n── 응답 ${passes} 통과 / ${fails} 실패`);
  console.log(`── DB ${errors.length ? `${errors.length}건 다름` : "같음"}${warnings.length ? ` (updated_at만 다름 ${warnings.length}건 — 경고)` : ""}`);
  for (const e of errors.slice(0, 30)) console.log(`    ${e}`);
  if (errors.length > 30) console.log(`    … 외 ${errors.length - 30}건`);
  for (const w of warnings.slice(0, 5)) console.log(`    (경고) ${w}`);
  console.log(`── 파일 ${fileDiffs.length ? `${fileDiffs.length}건 다름` : "같음"}`);
  for (const f of fileDiffs.slice(0, 20)) console.log(`    ${f}`);

  const ok = !fails && !errors.length && !fileDiffs.length;
  if ((mode === "record" && ok && !only) || (mode === "golden-update" && !only)) {
    const g: Golden = {
      scenario: scenario.name, recordedFrom: mode === "record" ? "java" : "ts", recordedAt: kstNow(),
      steps: recorded, db: mode === "record" ? changes(base, da) : tsChanges, files: mode === "record" ? fa : fb,
    };
    fs.mkdirSync(path.dirname(goldenPath(scenario.name)), { recursive: true });
    fs.writeFileSync(goldenPath(scenario.name), JSON.stringify(g, null, 1) + "\n");
    console.log(`\n녹화 → test/golden/${scenario.name}.json (${(fs.statSync(goldenPath(scenario.name)).size / 1024).toFixed(0)}KB)`);
  } else if (mode === "record" && !ok) {
    console.log("\n녹화 안 함 — 비교가 실패했다");
  }

  fs.writeFileSync(path.join(work, "java.log"), javaLog.join(""));
  fs.writeFileSync(path.join(work, "ts.log"), tsLog.join(""));
  if (keep) console.log(`\n작업 폴더 유지: ${work}  (java.log · ts.log · java-db · ts-db · *-data)`);
  else fs.rmSync(work, { recursive: true, force: true });
  if (fails || errors.length || fileDiffs.length) {
    if (!keep) {
      const errLines = (javaLog.join("") + tsLog.join("")).split("\n").filter(l => /ERROR|Exception|에러|처리 못 한/.test(l)).slice(0, 10);
      if (errLines.length) console.log(`\n서버 로그의 오류 줄:\n${errLines.join("\n")}`);
    }
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
