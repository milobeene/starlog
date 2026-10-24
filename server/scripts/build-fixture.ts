/**
 * Neon JSON 백업 → PGlite 데이터 폴더.
 *
 * 회귀 테스트의 실데이터 픽스처와 실데이터 이전이 같은 걸 쓴다.
 * 스키마는 **백업을 뜬 시점의 버전까지만** SQL을 돌려 만든다 — 그때의 DDL이라야 행이 그대로 들어간다.
 * 그 뒤 버전(V14 등)은 데이터를 넣은 **다음에** 돈다. Neon에 새 버전이 처음 닿을 때와 같은 순서라,
 * 픽스처를 만들 때마다 새 마이그레이션이 실데이터 위에서 시험된다.
 *
 *   npx tsx scripts/build-fixture.ts <migration폴더> <백업폴더> <출력폴더> [--with-flyway-history]
 *
 * `--with-flyway-history`면 백업의 이력 행까지 넣고 나머지를 앱 러너(`migrate`)로 올린다.
 * 없으면 이력 없이 나머지 SQL을 그대로 돌린다
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { openDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";

const [migDir, backupDir, outDir, ...flags] = process.argv.slice(2);
if (!migDir || !backupDir || !outDir) {
  console.error("사용법: build-fixture.ts <migration폴더> <백업폴더> <출력폴더> [--with-flyway-history]");
  process.exit(2);
}
const withFlyway = flags.includes("--with-flyway-history");

fs.rmSync(outDir, { recursive: true, force: true });
const db = await PGlite.create(outDir);

const versionOf = (f: string) => +f.match(/^V(\d+)/)![1]!;
const files = fs.readdirSync(migDir).filter(f => f.endsWith(".sql")).sort((a, b) => versionOf(a) - versionOf(b));
// 백업의 이력이 곧 그때의 스키마 버전이다. 이력이 없는 옛 백업이면 전부
const historyFile = path.join(backupDir, "flyway_schema_history.json");
const backupVersion = fs.existsSync(historyFile)
  ? Math.max(...(JSON.parse(fs.readFileSync(historyFile, "utf8")) as { version: string | null }[]).map(h => Number(h.version ?? 0)))
  : Infinity;
const before = files.filter(f => versionOf(f) <= backupVersion);
const after = files.filter(f => versionOf(f) > backupVersion);
for (const f of before) await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));

// 이력을 넣을 때만 테이블을 만든다 — 테이블만 있고 행이 없으면 러너가 V1부터 다시 돌리려 한다
if (withFlyway) {
  await db.exec(`create table "flyway_schema_history" (
    "installed_rank" integer not null primary key, "version" varchar(50), "description" varchar(200) not null,
    "type" varchar(20) not null, "script" varchar(1000) not null, "checksum" integer,
    "installed_by" varchar(100) not null, "installed_on" timestamp not null default now(),
    "execution_time" integer not null, "success" boolean not null)`);
}

await db.exec("set session_replication_role = replica");
const skip = new Set(withFlyway ? [] : ["flyway_schema_history"]);
for (const f of fs.readdirSync(backupDir).filter(f => f.endsWith(".json") && !f.startsWith("_"))) {
  const table = f.replace(/\.json$/, "");
  if (skip.has(table)) continue;
  const rows: Record<string, unknown>[] = JSON.parse(fs.readFileSync(path.join(backupDir, f), "utf8"));
  for (const r of rows) {
    const cols = Object.keys(r);
    const vals = cols.map(c => (r[c] !== null && typeof r[c] === "object") ? JSON.stringify(r[c]) : r[c]);
    await db.query(
      `insert into "${table}" (${cols.map(c => `"${c}"`).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
      vals);
  }
}
await db.exec("set session_replication_role = origin");

// identity 시퀀스를 max(id)로 — 명시적 id로 넣으면 시퀀스가 1에 멈춰 있어 다음 insert가 부딪힌다
const idents = await db.query<{ t: string; c: string }>(
  `select table_name t, column_name c from information_schema.columns
   where table_schema='public' and is_identity='YES'`);
for (const { t, c } of idents.rows) {
  await db.exec(`select setval(pg_get_serial_sequence('"${t}"','${c}'),
    greatest((select coalesce(max("${c}"),0) from "${t}"),1), (select count(*)>0 from "${t}"))`);
}

// 대조
const summary = JSON.parse(fs.readFileSync(path.join(backupDir, "_summary.json"), "utf8")).counts as Record<string, number>;
let bad = 0;
for (const [tb, n] of Object.entries(summary)) {
  if (skip.has(tb)) continue;
  const r = await db.query<{ c: number }>(`select count(*)::int c from "${tb}"`);
  if (r.rows[0]!.c !== n) { console.error(`MISMATCH ${tb}: ${r.rows[0]!.c} != ${n}`); bad++; }
}
if (bad) { await db.close(); process.exit(1); }

// 백업 뒤의 버전 — 실데이터 위에서 돈다
if (after.length && withFlyway) {
  await db.close();
  const o = await openDb({ kind: "pglite", dir: outDir });
  const { applied } = await migrate(o);
  await o.close();
  console.log(`백업 뒤 마이그레이션: V${applied.join(", V")}`);
} else {
  for (const f of after) await db.transaction(async (tx) => { await tx.exec(fs.readFileSync(path.join(migDir, f), "utf8")); });
  await db.close();
  if (after.length) console.log(`백업 뒤 마이그레이션: ${after.join(", ")}`);
}
console.log(`fixture ok → ${outDir} (${Object.keys(summary).length - skip.size} tables, ${idents.rows.length} sequences)`);
