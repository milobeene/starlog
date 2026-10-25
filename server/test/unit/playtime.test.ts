import { describe, expect, it } from "vitest";
import { hoursText, minutesText, tenthsFromHours, tenthsOf } from "../../src/domains/backlog/playtime";

describe("플레이타임 단위 — 0.1분 정수 (v2 S4)", () => {
  it("시간 소수 둘째 자리는 분 소수 첫째 자리로 손실 없이 간다 (V15의 전제)", () => {
    expect(tenthsFromHours("2.38")).toBe(1428n);
    expect(tenthsFromHours("1.62")).toBe(972n);
    expect(tenthsFromHours("99999.99")).toBe(59999994n);
    // 모든 0.01시간 단계가 되돌아온다
    for (let cents = 0; cents <= 20000; cents++) {
      const h = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
      expect(hoursText(tenthsFromHours(h))).toBe(h);
    }
  });
  it("분 → 시간은 HALF_UP 한 번", () => {
    expect(hoursText(1400n)).toBe("2.33");   // 140분
    expect(hoursText(3n)).toBe("0.01");      // 0.3분 = 0.005시간
    expect(hoursText(2n)).toBe("0.00");
    expect(hoursText(0n)).toBe("0.00");
  });
  it("분 글자 ↔ 0.1분", () => {
    expect(tenthsOf("30.04")).toBe(300n);
    expect(tenthsOf("30.05")).toBe(301n);
    expect(tenthsOf("-249")).toBe(-2490n);
    expect(minutesText(-2490n)).toBe("-249.0");
    expect(minutesText(-5n)).toBe("-0.5");
    expect(minutesText(1428n)).toBe("142.8");
  });
});
