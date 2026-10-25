import { describe, expect, it } from "vitest";
import { connectionFields } from "../../src/db/client";
import { loadConfig, unsafeStartup } from "../../src/config";

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
  it("sslmode가 없으면 TLS + 인증서 검증 — 평문은 disable을 적었을 때만", () => {
    expect(connectionFields("postgresql://ep-x.neon.tech/neondb").ssl).toEqual({ rejectUnauthorized: true });
    expect(connectionFields("postgresql://ep-x.neon.tech/neondb?sslmode=prefer").ssl).toEqual({ rejectUnauthorized: true });
    expect(connectionFields("postgresql://ep-x.neon.tech/neondb?sslmode=require&channel_binding=require").ssl).toEqual({ rejectUnauthorized: true });
  });
});

describe("기동 설정 확인", () => {
  const base = { STARLOG_DB_DIR: "memory://x" };
  it("운영 프로필은 토큰이 있어야, dev·test는 토큰이 없어야 뜬다", () => {
    expect(unsafeStartup(loadConfig(base))).toBe("API_TOKEN_MISSING");
    expect(unsafeStartup(loadConfig({ ...base, STARLOG_API_TOKEN: "  " }))).toBe("API_TOKEN_MISSING");
    expect(unsafeStartup(loadConfig({ ...base, STARLOG_API_TOKEN: "t" }))).toBe(null);
    expect(unsafeStartup(loadConfig({ ...base, STARLOG_PROFILE: "dev" }))).toBe(null);
    expect(unsafeStartup(loadConfig({ ...base, STARLOG_PROFILE: "test", STARLOG_API_TOKEN: "t" }))).toBe("DEV_PROFILE_WITH_TOKEN");
  });
});
