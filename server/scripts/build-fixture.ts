/**
 * Neon JSON 백업 → PGlite 데이터 폴더.
 *
 * 비교 테스트(자바 vs TS)와 실데이터 이전이 같은 걸 쓴다.
 * 스키마는 Flyway SQL을 그대로 돌려 만든다 — Neon과 같은 DDL이라야 데이터가 그대로 들어간다.
 *
 *   npx tsx scripts/build-fixture.ts <migration폴더> <백업폴더> <출력폴더> [--with-flyway-history]
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";

const [migDir, backupDir, outDir, ...flags] = process.argv.slice(2);
if (!migDir || !backupDir || !outDir) {
  console.error("사용법: build-fixture.ts <migration폴더> <백업폴더> <출력폴더> [--with-flyway-history]");
  process.exit(2);
}
const withFlyway = flags.includes("--with-flyway-history");

fs.rmSync(outDir, { recursive: true, force: true });
const db = await PGlite.create(outDir);

const files = fs.readdirSync(migDir).filter(f => f.endsWith(".sql"))
  .sort((a, b) => +a.match(/^V(\d+)/)![1]! - +b.match(/^V(\d+)/)![1]!);
for (const f of files) await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));

// 자바(Flyway)를 붙일 때만 이력 테이블을 만든다 — 없으면 Flyway가 처음부터 다시 돌리려 한다
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
await db.close();
if (bad) process.exit(1);
console.log(`fixture ok → ${outDir} (${Object.keys(summary).length - skip.size} tables, ${idents.rows.length} sequences)`);
