/**
 * 클라우드 쪽 마이그레이션 — pglite-socket을 Postgres 서버 대신 쓴다 (node-postgres로 붙는다).
 * 스키마 옵션(`search_path`가 첫 쿼리 전에 걸리는가)과 동시 기동 잠금을 본다
 */
import net from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { openDb, type OpenDb } from "../../src/db/client";
import { migrate } from "../../src/db/migrate";
import { MIGRATIONS } from "../../src/db/migrations.generated";
import { rows } from "../../src/db/raw";
import { sql } from "drizzle-orm";

const freePort = () => new Promise<number>((res) => {
  const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); });
});

let pg: PGlite;
let server: PGLiteSocketServer;
let port: number;
const opened: OpenDb[] = [];

beforeAll(async () => {
  pg = await PGlite.create();
  await pg.exec(`create schema s1`);
  port = await freePort();
  server = new PGLiteSocketServer({ db: pg, port, maxConnections: 10 });
  await server.start();
});

afterAll(async () => {
  for (const o of opened) await o.close().catch(() => {});
  await server.stop();
  await pg.close();
});

const open = async () => {
  const o = await openDb({ kind: "postgres", url: `postgresql://127.0.0.1:${port}/postgres?sslmode=disable`, user: "postgres", password: "postgres", schema: "s1" });
  opened.push(o);
  return o;
};

describe("클라우드 마이그레이션", () => {
  it("둘이 동시에 올려도 한쪽만 적용하고, 스키마 옵션 안에 만든다", async () => {
    const [a, b] = [await open(), await open()];
    const [ra, rb] = await Promise.all([migrate(a), migrate(b)]);
    expect([ra.applied.length, rb.applied.length].sort()).toEqual([0, MIGRATIONS.length]);
    const [h] = await rows<{ n: number }>(a.db, sql`select count(*)::int as n from s1.flyway_schema_history`);
    expect(h!.n).toBe(MIGRATIONS.length);
    // 첫 쿼리부터 스키마가 걸려 있다 (예전엔 SET을 기다리지 않고 쏴서 겹쳐 돌았다)
    const [s] = await rows<{ s: string }>(b.db, sql`select current_schema() as s`);
    expect(s!.s).toBe("s1");
    const [pub] = await rows<{ n: number }>(a.db, sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
    expect(pub!.n).toBe(0);
  }, 60_000);
});
