import { describe, expect, it } from "vitest";
import { testToday, todayKst } from "../../src/common/clock";

describe("테스트용 고정 오늘", () => {
  it("dev·test 프로필에서만 듣는다", () => {
    expect(testToday({ STARLOG_PROFILE: "test", STARLOG_TEST_TODAY: "2026-10-25" })).toBe("2026-10-25");
    expect(testToday({ STARLOG_PROFILE: "dev", STARLOG_TEST_TODAY: "2026-10-25" })).toBe("2026-10-25");
  });
  it("운영 프로필(프로필 없음 포함)은 무시한다", () => {
    expect(testToday({ STARLOG_TEST_TODAY: "2026-10-25" })).toBeNull();
    expect(testToday({ STARLOG_PROFILE: "prod", STARLOG_TEST_TODAY: "2026-10-25" })).toBeNull();
  });
  it("형식이 틀리면 무시한다", () => {
    expect(testToday({ STARLOG_PROFILE: "test", STARLOG_TEST_TODAY: "내일" })).toBeNull();
  });
  it("todayKst: 운영 프로필에선 실제 오늘, 인자를 주면 그 날짜", () => {
    const save = { p: process.env.STARLOG_PROFILE, t: process.env.STARLOG_TEST_TODAY };
    try {
      delete process.env.STARLOG_PROFILE; process.env.STARLOG_TEST_TODAY = "2001-01-01";
      expect(todayKst()).not.toBe("2001-01-01");
      process.env.STARLOG_PROFILE = "test";
      expect(todayKst()).toBe("2001-01-01");
      expect(todayKst(new Date("2030-05-06T00:00:00Z"))).toBe("2030-05-06");
    } finally {
      for (const [k, v] of [["STARLOG_PROFILE", save.p], ["STARLOG_TEST_TODAY", save.t]] as const) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });
});
