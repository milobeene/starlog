/**
 * DB 연결 — 로컬(PGlite)과 클라우드(node-postgres → Neon)를 같은 Drizzle 타입 하나로 연다.
 *
 * ⚠️ **두 드라이버의 타입 변환을 똑같이 고정한다.** 기본값이 서로 달라서 그냥 두면
 * 로컬과 클라우드에서 응답이 갈린다:
 *   - int8: PGlite는 number, node-postgres는 string → 둘 다 number
 *   - date·timestamp: PGlite는 `Date`로 바꾸면서 **로컬 시간대로 밀고 마이크로초를 버린다**
 *     (`.781806` → `.781`) → 둘 다 원문 문자열. 기존 응답(Jackson)이 마이크로초까지 냈고 화면·데이터가 거기 기대 있다
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
  kind: DbTarget["kind"];
  /**
   * 여러 문장짜리 SQL을 **트랜잭션 하나로** 돌린다 (마이그레이션용).
   * Drizzle의 `execute`는 확장 프로토콜이라 PGlite에서 문장 하나만 받는다
   */
  execScript: (script: string) => Promise<void>;
  /**
   * 클라우드만. 같은 DB를 여러 PC가 동시에 열면 마이그레이션이 겹쳐 돈다 (`installed_rank` PK 충돌).
   * 잠금을 쥔 **연결 하나·트랜잭션 하나**로 `fn`을 돌린다 — `fn`은 받은 `db`·`execScript`만 써야 한다.
   * 로컬은 잠금 파일이 이미 막는다
   */
  exclusive?: <T>(fn: (o: Pick<OpenDb, "db" | "execScript">) => Promise<T>) => Promise<T>;
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
    };
  }
  /*
   * 스키마 지정 (결정 60) — 한 DB에 남의 테이블과 공존할 때. 시작 파라미터(`options`)가 아니라
   * 연결마다 SET으로 건다 — Neon 풀러(PgBouncer)는 시작 파라미터 `options`를 거절한다.
   * `onConnect`는 풀이 **기다린 뒤에** 연결을 내준다 — `connect` 이벤트에서 쏘면 첫 쿼리와 겹쳐 돌았다
   * (pg가 "이미 쿼리 중" 경고를 내고, SET이 실패해도 조용히 public으로 돌았다). 실패하면 그 연결은 버려진다
   */
  const ident = target.schema ? quoteIdent(target.schema) : null;
  const pool = new pg.Pool({
    ...connectionFields(target.url),
    user: target.user ?? undefined,
    password: target.password ?? undefined,
    max: 3,
    idleTimeoutMillis: 60_000,
    // 타입 정의는 반환을 void로 적었지만 pg-pool(3.14)은 돌려준 Promise를 기다린다
    ...(ident === null ? {} : { onConnect: async (c: pg.ClientBase) => { await c.query(`set search_path to "${ident}"`); } }),
  });
  /*
   * 풀의 `types`로는 안 먹는다 — Drizzle(node-postgres)이 쿼리마다 자기 `types`를 넘기고
   * 나머지 oid는 전역 `pg.types`로 돌려서, 날 SQL(`rows()`)의 int8이 "237" 문자열로 왔다. 그래서 전역에 건다
   */
  for (const [oid, parse] of Object.entries(PARSERS)) pg.types.setTypeParser(Number(oid), parse);
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
    exclusive: async (fn) => {
      /*
       * 트랜잭션 잠금(`xact`)이다. 세션 잠금은 Neon 풀러(트랜잭션 모드)에서 문장이 끝나면 서버 연결이
       * 남에게 넘어가 엉뚱한 세션에 남는다. 일은 **같은 연결**에서 한다 — 잠금 트랜잭션을 열어 둔 채
       * 다른 연결로 돌리면, 연결이 하나뿐인 서버(pglite-socket)에서는 서로 기다리다 멈춘다
       */
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("select pg_advisory_xact_lock(hashtext('starlog:migrate'))");
        const r = await fn({
          db: drizzlePg({ client: c, schema }) as unknown as Db,
          execScript: async (script) => { await c.query(script); },
        });
        await c.query("commit");
        return r;
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
 * SSL: **기본이 TLS + 인증서 검증**이다 (Neon은 정식 인증서다). 평문은 `sslmode=disable`을 적었을 때만.
 * 예전엔 `sslmode`가 없으면 평문이었다 — 주소에서 한 조각 빠뜨린 것만으로 비밀번호가 평문으로 나갔다 (보안 점검 2026-10-25).
 * `require`·`prefer`·`allow`도 검증한다 — libpq의 "암호화만, 검증은 안 함"을 따라 할 이유가 없다
 */
export function connectionFields(url: string) {
  const u = new URL(url.replace(/^postgres(ql)?:/, "http:"));
  const sslmode = u.searchParams.get("sslmode");
  return {
    host: decodeURIComponent(u.hostname),
    port: u.port ? Number(u.port) : 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, "")) || undefined,
    ssl: sslmode === "disable" ? undefined : { rejectUnauthorized: true },
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
