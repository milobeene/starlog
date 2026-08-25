package com.milobeene.starlog.common.dto;

import com.milobeene.starlog.common.entity.Money;

import java.math.BigDecimal;

/** 금액 응답. scale 2는 Money가 이미 보장했다 */
public record MoneyResponse(
        BigDecimal amount,
        String currency
) {

    public static MoneyResponse from(Money money) {
        if (money == null) {
            return null;
        }
        return new MoneyResponse(money.getAmount(), money.getCurrency());
    }
}
