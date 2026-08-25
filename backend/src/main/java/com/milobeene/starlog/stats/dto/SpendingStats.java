package com.milobeene.starlog.stats.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * 지출 (FR-STAT-04, BR-ACQ-01).
 *
 * **두 축을 합치지 않는다.** 구독료를 개별 게임에 배분하는 건 기준이 자의적이라 기각됐다.
 *
 * **통화별로도 합치지 않는다.** Money가 ISO 4217을 받는데 환산하려면 환율이 필요하고,
 * 그건 범위 밖이다. KRW·USD를 더해 버리면 조용히 틀린 숫자가 나온다
 */
public record SpendingStats(
        List<AmountByCurrency> purchases,
        List<AmountByCurrency> subscriptions
) {

    public record AmountByCurrency(String currency, BigDecimal total) {}
}
