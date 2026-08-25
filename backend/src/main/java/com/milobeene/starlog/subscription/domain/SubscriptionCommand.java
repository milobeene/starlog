package com.milobeene.starlog.subscription.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 구독 입력값 묶음 (FR-ACQ-04) */
public record SubscriptionCommand(
        String serviceName,     // 마스터 엔티티가 아니라 문자열 (OI-06 해소)
        LocalDate startedOn,
        LocalDate endedOn,      // null = 구독 중
        BigDecimal feeAmount,   // null 허용
        String feeCurrency,
        BillingCycle billingCycle
) {
}
