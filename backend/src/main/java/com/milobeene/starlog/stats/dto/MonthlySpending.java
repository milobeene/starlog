package com.milobeene.starlog.stats.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 월별 지출 추이 (FR-STAT-07).
 *
 * 통화별로 선이 하나씩이다 — 환산에 환율이 필요해 합치지 않는다 (§6.6과 같은 이유).
 * `currencies`를 따로 주는 이유는 화면이 선을 몇 개 그릴지 먼저 알아야 하기 때문이다
 */
public record MonthlySpending(
        List<String> currencies,
        List<Bucket> months,
        List<YearlyAverage> yearlyAverages
) {

    /**
     * period는 `2026-01`.
     *
     * `items` — 그 달에 돈이 나간 것들의 이름. **구독이 먼저, 그다음 게임**이다.
     *
     * 금액만 있으면 "이 달에 왜 이만큼 썼지"에 답이 안 된다. 구독을 앞에 두는 이유는
     * 구독이 매달 고정으로 깔리는 바닥이라 먼저 읽혀야 나머지가 변동분으로 보이기 때문이다.
     *
     * 게임 이름은 `displayName`이다 — 오버라이드가 이미 반영된 표시용 이름 (§6.2).
     * 상한을 두지 않는다: 한 달에 사는 게임 수가 애초에 화면 한 줄을 넘길 일이 드물고,
     * 자르면 펼쳐도 다 안 보여 "펼치기"가 거짓말이 된다
     */
    public record Bucket(String period, Map<String, BigDecimal> amounts, List<String> items) {}

    /** **분모는 12개월 고정이다.** 데이터 있는 달만으로 나누면 해끼리 비교가 안 된다 */
    public record YearlyAverage(int year, Map<String, BigDecimal> amounts) {}
}
