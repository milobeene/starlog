import { describe, expect, it } from "vitest";
import { scale2, money, compareAmount } from "../../src/common/money";
import { normalize, slug, sortKey } from "../../src/common/text";
import { nowKst, todayKst } from "../../src/common/clock";
import { InvalidInput } from "../../src/common/errors";

describe("금액 — 자바 Money (scale 2, HALF_UP)", () => {
  it("반올림은 크기 기준으로 올린다", () => {
    expect(scale2("12000.555")).toBe("12000.56");
    expect(scale2("12000.554")).toBe("12000.55");
    expect(scale2(13500.555)).toBe("13500.56");
    expect(scale2("0.005")).toBe("0.01");
    expect(scale2("-1.005")).toBe("-1.01");
    expect(scale2("5")).toBe("5.00");
    expect(scale2(".5")).toBe("0.50");
  });
  it("부동소수로는 틀리는 값도 맞는다", () => {
    // 1.005 * 100 = 100.49999… 라 Math.round면 1.00이 된다
    expect(scale2(1.005)).toBe("1.01");
    expect(scale2(1e21)).toBe("1000000000000000000000.00");
  });
  it("검증 메시지가 자바와 같다", () => {
    expect(() => money(null, "KRW")).toThrow("금액은 필수입니다");
    expect(() => money(1, null)).toThrow("통화는 필수입니다");
    expect(() => money(-1, "KRW")).toThrow("금액은 0 이상이어야 합니다: -1");
    expect(() => money(1, "ABC")).toThrow("ISO 4217 통화 코드가 아닙니다: ABC");
    expect(money("5990.005", " usd ")).toEqual({ amount: "5990.01", currency: "USD" });
  });
  it("비교는 값으로", () => {
    expect(compareAmount("10", "10.00")).toBe(0);
    expect(compareAmount("9.99", "10")).toBe(-1);
  });
});

describe("문자열 — 자바 TextValues·Slugs·SortKeys", () => {
  it("strip 후 빈 값은 null, NBSP는 자바처럼 공백이 아니다", () => {
    expect(normalize("  a  ")).toBe("a");
    expect(normalize("   ")).toBeNull();
    expect(normalize(" a ")).toBe(" a ");
    expect(normalize("　a　")).toBe("a");
  });
  it("슬러그 — 결합 문자 제거, 한글 유지, 80자", () => {
    expect(slug("Pokémon Legends: Z-A")).toBe("pokemon-legends-z-a");
    expect(slug("젤다의 전설 티어스 오브 더 킹덤")).toBe("젤다의-전설-티어스-오브-더-킹덤");
    expect(slug("!!!")).toBe("untitled");
    expect(slug(null)).toBe("untitled");
    expect(slug("a".repeat(100))).toHaveLength(80);
  });
  it("정렬 키 — 숫자·기호 < 라틴 < 한글 < 나머지", () => {
    expect(sortKey("7 Days")).toBe("0|7 days");
    expect(sortKey("Zelda")).toBe("1|zelda");
    expect(sortKey("나인 솔즈")).toBe("2|나인 솔즈");
    expect(sortKey("ペルソナ")).toBe("3|ペルソナ");
    expect(sortKey("   ")).toBeNull();
  });
});

describe("시계 — Asia/Seoul 벽시계", () => {
  it("UTC 15시는 KST 다음 날 0시", () => {
    const d = new Date("2026-10-24T15:00:00.123Z");
    expect(nowKst(d)).toBe("2026-10-25 00:00:00.123");
    expect(todayKst(d)).toBe("2026-10-25");
  });
});

it("오류 타입", () => {
  expect(() => money(null, "KRW")).toThrow(InvalidInput);
});
