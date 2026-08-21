package com.milobeene.gamebacklog.common.dto;

import com.milobeene.gamebacklog.common.entity.Money;

import java.math.BigDecimal;

/**
 * 금액 입력. Command는 amount/currency가 평평하지만 JSON은 중첩이 자연스럽다.
 *
 * 통화 코드 검증(ISO 4217)은 여기서 하지 않는다. Money 생성자가 이미 한다 —
 * 같은 규칙이 두 곳에 생기면 언젠가 갈라진다
 */
public record MoneyRequest(
        BigDecimal amount,
        String currency
) {

    /** amount가 null이면 금액이 통째로 없는 것으로 본다 (AcquisitionCommand의 기존 규칙) */
    public Money toMoney() {
        if (amount == null) {
            return null;
        }
        return new Money(amount, currency);
    }

    /** 필드 자체가 생략된 경우까지 흡수한다. 평평한 Command로 풀어 넘길 때 쓴다 */
    public static Money toMoney(MoneyRequest request) {
        return request == null ? null : request.toMoney();
    }
}
