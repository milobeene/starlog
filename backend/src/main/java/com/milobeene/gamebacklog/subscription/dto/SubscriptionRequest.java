package com.milobeene.gamebacklog.subscription.dto;

import com.milobeene.gamebacklog.common.dto.MoneyRequest;
import com.milobeene.gamebacklog.subscription.domain.BillingCycle;
import com.milobeene.gamebacklog.subscription.domain.SubscriptionCommand;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 구독 등록·수정 공용 (FR-ACQ-04). 서비스명은 마스터가 아니라 문자열이다 (OI-06) */
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SubscriptionRequest(
        @NotBlank @Size(max = 100) String serviceName,
        @NotNull LocalDate startedOn,
        LocalDate endedOn,          // null = 구독 중
        MoneyRequest fee,
        BillingCycle billingCycle
) {

    public SubscriptionCommand toCommand() {
        BigDecimal amount = fee == null ? null : fee.amount();
        String currency = fee == null ? null : fee.currency();

        return new SubscriptionCommand(serviceName, startedOn, endedOn,
                amount, currency, billingCycle);
    }
}
