import { describe, expect, it } from "vitest";
import { loadConfig, setConfig } from "../../src/config";
import { coverTarget } from "../../src/common/storage";

// 가짜 자격증명 — 넷 다 차 있으면 "있다"로 본다 (실제로 부르지 않는다)
const CREDS = {
  APP_STORAGE_ENDPOINT: "https://acct.fake-r2.example",
  APP_STORAGE_BUCKET: "b",
  APP_STORAGE_ACCESS_KEY: "k",
  APP_STORAGE_SECRET_KEY: "s",
};
const target = (env: Record<string, string>) => {
  setConfig(loadConfig({ STARLOG_DB_DIR: "memory://cover", STARLOG_DATA_ROOT: "/tmp/starlog-cover-unit", ...env }));
  return coverTarget();
};

describe("커버 위치 (STARLOG_COVER_TARGET)", () => {
  it("기본은 DB", () => {
    expect(target({})).toBe("DB");
  });

  it("고른 대로 — db · local · storage(자격증명 있음)", () => {
    expect(target({ STARLOG_COVER_TARGET: "db", ...CREDS })).toBe("DB");
    expect(target({ STARLOG_COVER_TARGET: "local" })).toBe("LOCAL");
    expect(target({ STARLOG_COVER_TARGET: " Storage ", ...CREDS })).toBe("EXTERNAL");
  });

  it("스토리지인데 자격증명이 없거나 반쪽이면 DB (예전엔 LOCAL)", () => {
    expect(target({ STARLOG_COVER_TARGET: "storage" })).toBe("DB");
    expect(target({ STARLOG_COVER_TARGET: "storage", ...CREDS, APP_STORAGE_SECRET_KEY: " " })).toBe("DB");
  });

  it("로컬인데 데이터 루트가 없으면 DB", () => {
    setConfig(loadConfig({ STARLOG_DB_DIR: "memory://cover", STARLOG_COVER_TARGET: "local" }));
    expect(coverTarget()).toBe("DB");
  });

  it("옛 체크박스 — 새 변수가 없을 때만. 켜짐 → 스토리지, 꺼짐 → DB (LOCAL이 아니다)", () => {
    expect(target({ STARLOG_MEDIA_USE_STORAGE_FOR_COVERS: "true", ...CREDS })).toBe("EXTERNAL");
    expect(target({ STARLOG_MEDIA_USE_STORAGE_FOR_COVERS: "true" })).toBe("DB");
    expect(target({ STARLOG_MEDIA_USE_STORAGE_FOR_COVERS: "false", ...CREDS })).toBe("DB");
    expect(target({ STARLOG_MEDIA_USE_STORAGE_FOR_COVERS: "true", STARLOG_COVER_TARGET: "local", ...CREDS })).toBe("LOCAL");
  });

  it("모르는 값은 DB — 기동을 막지 않는다", () => {
    expect(target({ STARLOG_COVER_TARGET: "s3", ...CREDS })).toBe("DB");
  });
});
