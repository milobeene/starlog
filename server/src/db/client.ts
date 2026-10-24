/**
 * DB 연결 — 로컬(PGlite)과 클라우드(node-postgres → Neon)를 같은 Drizzle 타입 하나로 연다.
 *
 * ⚠️ **두 드라이버의 타입 변환을 똑같이 고정한다.** 기본값이 서로 달라서 그냥 두면
 * 로컬과 클라우드에서 응답이 갈린다:
 *   - int8: PGlite는 number, node-postgres는 string → 둘 다 number
 *   - date·timestamp: PGlite는 `Date`로 바꾸면서 **로컬 시간대로 밀고 마이크로초를 버린다**
 *     (`.781806` → `.781`) → 둘 다 원문 문자열. 자바(Jackson)는 마이크로초까지 낸다
 *   - numeric: 둘 다 문자열 그대로 (금액 계산은 `common/money.ts`)
 *
 * ⚠️ PGlite는 세션이 하나라 **트랜잭션이 열린 동안 다른 쿼리는 기다린다** (2026-10-24 실측).
 * 그래서 격리는 공짜지만, 트랜잭션 안에서 외부 호출(IGDB·번역·S3)을 하면 그동안 앱 전체가 멈춘다.
 * **외부 호출은 트랜잭션 밖에서.**
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as tables from "./schema";
import * as relations from "./relations";
import type { DbTarget } from "../config";

export const schema = { ...tables, ...relations };
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** 트랜잭션 콜백이 받는 것. `Db`를 받는 함수에 그대로 넘길 수 있다 */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const OID = { int8: 20, numeric: 1700, date: 1082, time: 1083, timestamp: 1114, timestamptz: 1184, timetz: 1266 } as const;
const raw = (v: string) => v;
const toNumber = (v: string) => Number(v);
const PARSERS: Record<number, (v: string) => unknown> = {
  [OID.int8]: toNumber,
  [OID.numeric]: raw,
  [OID.date]: raw,
  [OID.time]: raw,
  [OID.timestamp]: raw,
  [OID.timestamptz]: raw,
  [OID.timetz]: raw,
};

export interface OpenDb {
  db: Db;
  close: () => Promise<void>;
  /** 로컬만. 세이브파일 백업·내보내기 (`.tar.gz` 한 장) */
  dumpDataDir?: () => Promise<Blob>;
  kind: DbTarget["kind"];
  /**
   * 여러 문장짜리 SQL을 **트랜잭션 하나로** 돌린다 (마이그레이션용).
   * Drizzle의 `execute`는 확장 프로토콜이라 PGlite에서 문장 하나만 받는다
   */
  execScript: (script: string) => Promise<void>;
}

export async function openDb(target: DbTarget): Promise<OpenDb> {
  if (target.kind === "pglite") {
    const client = await PGlite.create(target.dir, { parsers: PARSERS });
    const db = drizzlePglite({ client, schema }) as unknown as Db;
    return {
      db,
      kind: "pglite",
      execScript: async (script) => { await client.transaction(async (tx) => { await tx.exec(script); }); },
      close: () => client.close(),
      dumpDataDir: () => client.dumpDataDir("gzip") as Promise<Blob>,
    };
  }
  const pool = new pg.Pool({
    ...connectionFields(target.url),
    user: target.user ?? undefined,
    password: target.password ?? undefined,
    max: 3,
    idleTimeoutMillis: 60_000,
    types: {
      getTypeParser: ((oid: number, format?: string) =>
        PARSERS[oid] ?? pg.types.getTypeParser(oid, format as "text")) as typeof pg.types.getTypeParser,
    },
  });
  /*
   * 스키마 지정 (결정 60) — 한 DB에 남의 테이블과 공존할 때. 시작 파라미터(`options`)가 아니라
   * 연결마다 SET으로 건다 — Neon 풀러(PgBouncer)는 시작 파라미터 `options`를 거절한다
   */
  if (target.schema) {
    const ident = quoteIdent(target.schema);
    pool.on("connect", (c) => { c.query(`set search_path to "${ident}"`).catch(() => {}); });
  }
  const db = drizzlePg({ client: pool, schema }) as unknown as Db;
  return {
    db,
    kind: "postgres",
    execScript: async (script) => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query(script);      // 파라미터 없는 query는 단순 프로토콜 — 여러 문장이 된다
        await c.query("commit");
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * 주소를 직접 푼다. ⚠️ **`connectionString`을 넘기면 안 된다** — node-postgres는 주소를 파싱한 값으로
 * 따로 준 `user`·`password`를 **덮어쓴다.** Neon 주소엔 비밀번호가 없어서(연결 설정에 따로 저장)
 * 비밀번호가 통째로 빠지고 `SASL: client password must be a string`으로 죽었다 (2026-10-24 실기에서).
 *
 * SSL: 주소의 `sslmode`가 disable이 아니면 인증서까지 검증한다 (Neon은 정식 인증서다)
 */
export function connectionFields(url: string) {
  const u = new URL(url.replace(/^postgres(ql)?:/, "http:"));
  const sslmode = u.searchParams.get("sslmode");
  return {
    host: decodeURIComponent(u.hostname),
    port: u.port ? Number(u.port) : 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, "")) || undefined,
    ssl: sslmode === null || sslmode === "disable" ? undefined : { rejectUnauthorized: true },
  };
}

function quoteIdent(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`스키마 이름이 올바르지 않습니다: ${name}`);
  return name;
}

let current: OpenDb | null = null;
export function setDb(o: OpenDb) { current = o; }
/** 요청 처리 코드가 쓰는 DB. 기동 때 한 번 정해진다 */
export function db(): Db {
  if (!current) throw new Error("DB가 아직 안 열렸습니다");
  return current.db;
}
export function openedDb(): OpenDb {
  if (!current) throw new Error("DB가 아직 안 열렸습니다");
  return current;
}
