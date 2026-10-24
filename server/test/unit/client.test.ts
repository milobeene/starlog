import { describe, expect, it } from "vitest";
import { connectionFields } from "../../src/db/client";

describe("클라우드 연결 주소 풀기", () => {
  it("user·password를 돌려주지 않는다 — 주는 순간 따로 넘긴 자격증명을 덮어쓴다", () => {
    const f = connectionFields("postgresql://ep-x.neon.tech/neondb?sslmode=require");
    expect(f).not.toHaveProperty("user");
    expect(f).not.toHaveProperty("password");
    expect(f).toEqual({ host: "ep-x.neon.tech", port: 5432, database: "neondb", ssl: { rejectUnauthorized: true } });
  });
  it("자바 시절 jdbc 주소를 서버가 jdbc:만 떼고 넘긴 모양, sslmode=disable", () => {
    expect(connectionFields("postgresql://127.0.0.1:55499/postgres?sslmode=disable"))
      .toEqual({ host: "127.0.0.1", port: 55499, database: "postgres", ssl: undefined });
  });
});
