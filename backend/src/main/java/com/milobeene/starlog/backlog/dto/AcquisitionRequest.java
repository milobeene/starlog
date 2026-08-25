package com.milobeene.starlog.backlog.dto;

import com.milobeene.starlog.backlog.domain.AcquisitionCommand;
import com.milobeene.starlog.backlog.domain.AcquisitionMethod;
import com.milobeene.starlog.common.dto.MoneyRequest;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 취득 추가·수정 공용 (FR-ACQ-01~06) */
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AcquisitionRequest(
        @NotNull AcquisitionMethod method,
        Long platformId,
        Long platformAccountId,
        Long subscriptionId,
        MoneyRequest price,
        LocalDate acquiredOn,
        @Size(max = 100) String label
) {

    /** Command는 금액이 평평하다. 중첩 JSON을 여기서 푼다 (DTO 설계서 §4.2) */
    public AcquisitionCommand toCommand() {
        BigDecimal amount = price == null ? null : price.amount();
        String currency = price == null ? null : price.currency();

        return new AcquisitionCommand(method, platformId, platformAccountId, subscriptionId,
                amount, currency, acquiredOn, label);
    }
}
