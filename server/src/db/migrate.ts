/**
 * 스키마 마이그레이션 — Flyway 대신.
 *
 * **`flyway_schema_history`를 그대로 읽고 쓴다.** 그래서 자바 시절에 Flyway가 V13까지 올려둔
 * Neon이 아무 전환 없이 이어진다 — 여기서 보면 V1~V13은 이미 적용된 것이다.
 * 새 DB면 테이블을 Flyway와 같은 모양으로 만들고 V1부터 돈다.
 *
 * 체크섬은 검사하지 않는다 (Flyway의 CRC32를 흉내 낼 이유가 없다 — SQL 파일은 앱 안에 박혀 있다).
 * 하나씩 트랜잭션으로 돌리고, 실패하면 거기서 멈춘다.
 */
import { sql } from "drizzle-orm";
import type { OpenDb } from "./client";
import { MIGRATIONS } from "./migrations.generated";
import { rows } from "./raw";

const HISTORY = `"flyway_schema_history"`;

export async function migrate(open: OpenDb): Promise<{ applied: string[] }> {
  const { db } = open;
  /*
   * ⚠️ 테이블·컬럼 이름을 큰따옴표로 감싼다. Flyway는 H2에도 소문자로 만들었는데
   * 안 감싸면 대문자로 올라가 못 찾는다 (자바 시절 `StartupDiagnostic`이 밟은 함정).
   * Postgres만 남았지만 같은 습관을 유지한다
   */
  await open.execScript(`create table if not exists ${HISTORY} (
    "installed_rank" integer not null primary key,
    "version" varchar(50),
    "description" varchar(200) not null,
    "type" varchar(20) not null,
    "script" varchar(1000) not null,
    "checksum" integer,
    "installed_by" varchar(100) not null,
    "installed_on" timestamp not null default now(),
    "execution_time" integer not null,
    "success" boolean not null)`);

  const done = await rows<{ version: string | null; success: boolean }>(db,
    sql.raw(`select "version", "success" from ${HISTORY}`));
  const failed = done.filter(r => !r.success);
  if (failed.length) throw new Error(`실패한 마이그레이션이 남아 있습니다: V${failed.map(r => r.version).join(", V")}`);
  const appliedSet = new Set(done.map(r => r.version));

  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (appliedSet.has(m.version)) continue;
    const started = Date.now();
    const [rank] = await rows<{ next: number }>(db,
      sql.raw(`select coalesce(max("installed_rank"), 0) + 1 as next from ${HISTORY}`));
    // 이력 기록을 같은 스크립트 끝에 붙인다 — 스키마 변경과 기록이 한 트랜잭션에 묶인다
    await open.execScript(`${m.sql}
;
insert into ${HISTORY} ("installed_rank", "version", "description", "type", "script", "checksum", "installed_by", "execution_time", "success")
values (${rank!.next}, ${lit(m.version)}, ${lit(m.description)}, 'SQL', ${lit(m.script)}, null, 'starlog', ${Date.now() - started}, true);`);
    applied.push(m.version);
  }
  return { applied };
}

/** 이름은 파일명에서 오지만 그래도 따옴표는 막는다 */
function lit(v: string) {
  return `'${v.replace(/'/g, "''")}'`;
}
