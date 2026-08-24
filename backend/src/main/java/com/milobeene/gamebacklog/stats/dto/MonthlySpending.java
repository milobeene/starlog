package com.milobeene.gamebacklog.stats.dto;

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

    /** period는 `2026-01` */
    public record Bucket(String period, Map<String, BigDecimal> amounts) {}

    /** **분모는 12개월 고정이다.** 데이터 있는 달만으로 나누면 해끼리 비교가 안 된다 */
    public record YearlyAverage(int year, Map<String, BigDecimal> amounts) {}
}
