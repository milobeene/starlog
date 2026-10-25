/**
 * 기동 진단. 문제가 있으면 `STARLOG_DIAGNOSTIC: <코드>` 한 줄을 찍고
 * 정해진 종료코드로 죽는다. **일렉트론이 그 줄을 읽어 한글 안내를 띄운다** — 코드 이름이 계약이다.
 *
 *   접속 → 실패면 SQLSTATE로 분류
 *        → 되면 스키마를 본다
 *            flyway_schema_history 있음 → 버전이 앱보다 최신이면 SCHEMA_TOO_NEW
 *            없는데 다른 테이블이 있음   → DB_NOT_EMPTY
 *            둘 다 없음(빈 DB)          → 통과. 마이그레이션이 다 만든다
 *
 * **만드는 건 자동, 지우는 건 절대 자동이 아니다.**
 */
import { sql } from "drizzle-orm";
import { MIGRATIONS } from "./db/migrations.generated";
import { rows } from "./db/raw";
import type { Db } from "./db/client";

export const DIAGNOSTIC = [
  "DB_UNREACHABLE", "DB_AUTH_FAILED", "DB_NOT_FOUND", "DB_NOT_EMPTY",
  "SCHEMA_TOO_NEW", "DB_UNKNOWN_ERROR", "DB_IN_USE", "DB_CORRUPTED",
  // 기동 설정이 안전하지 않다 (`config.ts` `unsafeStartup`). 뒤에 붙인다 — 앞엣것의 종료코드(40+순번)를 안 바꾸려고
  "API_TOKEN_MISSING", "DEV_PROFILE_WITH_TOKEN",
] as const;
export type DiagnosticCode = (typeof DIAGNOSTIC)[number];

export class DiagnosticFailure extends Error {
  constructor(readonly diagnostic: DiagnosticCode, readonly reason?: unknown) {
    super(`STARLOG_DIAGNOSTIC: ${diagnostic}`);
  }
  get exitCode() { return 40 + DIAGNOSTIC.indexOf(this.diagnostic); }
}

/** 접속 실패 분류. node-postgres는 네트워크 오류에 SQLSTATE가 없어 코드 이름(`ENOTFOUND` 등)으로 본다 */
export function classify(e: unknown): DiagnosticCode {
  const code = (e as { code?: unknown })?.code;
  if (typeof code !== "string") return "DB_UNKNOWN_ERROR";
  if (["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET", "EAI_AGAIN"].includes(code)) return "DB_UNREACHABLE";
  if (code.startsWith("08")) return "DB_UNREACHABLE";
  if (code.startsWith("28")) return "DB_AUTH_FAILED";
  if (code === "3D000") return "DB_NOT_FOUND";
  return "DB_UNKNOWN_ERROR";
}

const LATEST = Math.max(...MIGRATIONS.map(m => Number(m.version)));

export async function inspectSchema(db: Db): Promise<DiagnosticCode | null> {
  const [cur] = await rows<{ schema: string }>(db, sql`select current_schema() as schema`);
  const tables = await rows<{ name: string }>(db,
    sql`select table_name as name from information_schema.tables where table_schema = ${cur!.schema}`);
  const history = tables.some(t => t.name === "flyway_schema_history");
  if (history) {
    const vs = await rows<{ version: string | null }>(db, sql.raw(`select "version" from "flyway_schema_history"`));
    const max = Math.max(0, ...vs.map(v => Number(v.version ?? 0)).filter(Number.isFinite));
    return max > LATEST ? "SCHEMA_TOO_NEW" : null;
  }
  return tables.length > 0 ? "DB_NOT_EMPTY" : null;
}
