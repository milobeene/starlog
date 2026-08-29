package com.milobeene.starlog.stats.dto;

import java.util.List;

/**
 * 월별 완료 추이 (2026-08-29, 사용자 요청).
 *
 * `MonthlySpending`과 **같은 모양**이다 — 대시보드에서 두 차트가 나란히 서므로
 * 읽는 법이 같아야 한다. 다른 것은 셋뿐:
 *
 * <pre>
 *   통화가 없다        완료는 개수 하나다
 *   요약이 합계다      "올해 몇 개 깼나"가 자연스럽다. 지출은 매달 변동이라 평균이 뜻이 있었다
 *   items가 깬 게임    지출의 items가 "돈 나간 것들"이었던 자리
 * </pre>
 *
 * 완료의 정의는 지출과 무관하게 **종료일이 있는 COMPLETED 회차**다 (FR-STAT-02) —
 * 항목 상태를 쓰면 3회차까지 깬 게임이 1로만 세어진다.
 */
public record MonthlyCompletions(
        List<Bucket> months,
        List<YearlyTotal> years
) {
    /** period는 `2026-01`. items는 그 달에 완료한 게임의 표시명(오버라이드 반영) */
    public record Bucket(String period, long count, List<String> items) {}

    /** **평균이 아니라 합계다.** 지출과 갈리는 유일한 지점이라 이름으로 못박는다 */
    public record YearlyTotal(int year, long count) {}
}
