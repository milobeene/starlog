/**
 * 날 SQL 결과 꺼내기. Drizzle의 `execute`는 드라이버마다 결과 타입이 달라서
 * 공통 `Db` 타입으로는 `unknown`이 나온다 — PGlite·node-postgres 둘 다 `.rows`가 있다.
 *
 * 쿼리 빌더(`db.select()...`)로 되는 건 그걸 쓴다. 이건 윈도 함수·`distinct on`처럼
 * 빌더로 쓰기 어색한 것만.
 */
import type { SQL } from "drizzle-orm";
import type { Db } from "./client";

export async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  const r = (await db.execute(query)) as unknown as { rows: T[] };
  return r.rows;
}

export async function one<T>(db: Db, query: SQL): Promise<T | undefined> {
  return (await rows<T>(db, query))[0];
}
