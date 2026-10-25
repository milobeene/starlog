import { describe, expect, it } from "vitest";
import { deriveState } from "../../src/domains/backlog/shared";

const pt = (id: number, sequenceNo: number, startedOn: string, finishedOn: string | null, status: string) =>
  ({ id, sequenceNo, startedOn, finishedOn, status } as Parameters<typeof deriveState>[0][number]);

describe("최신 회차 — 같은 날 맞닿는 회차 (BR-PT-02 완화, 2026-10-25)", () => {
  it("D에 끝난 회차 뒤 D에 시작한 진행 중 회차가 최신이다 (번호와 상관없이)", () => {
    // 과거 회차를 나중에 적어서 번호가 더 크다
    const s = deriveState([pt(1, 1, "2026-10-01", null, "PLAYING"), pt(2, 2, "2026-09-20", "2026-10-01", "COMPLETED")], true);
    expect(s).toEqual({ status: "PLAYING", lastPlayedOn: "2026-10-01", lastPlaythroughId: 1 });
  });
  it("둘 다 닫혔으면 늦게 시작한 쪽 (D~D가 C~D 뒤)", () => {
    const s = deriveState([pt(5, 2, "2026-10-05", "2026-10-05", "DROPPED"), pt(4, 3, "2026-10-01", "2026-10-05", "COMPLETED")], true);
    expect(s.lastPlaythroughId).toBe(5);
  });
  it("날짜가 다르면 예전처럼 날짜가 정한다", () => {
    const s = deriveState([pt(1, 5, "2025-01-01", "2025-01-02", "COMPLETED"), pt(2, 1, "2026-01-01", "2026-01-03", "DROPPED")], false);
    expect(s).toEqual({ status: "DROPPED", lastPlayedOn: "2026-01-03", lastPlaythroughId: 2 });
  });
});
