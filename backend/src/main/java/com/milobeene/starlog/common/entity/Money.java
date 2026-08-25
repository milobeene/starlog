package com.milobeene.starlog.common.entity;

import com.milobeene.starlog.common.exception.InvalidInputException;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;

@Getter
@Embeddable
public class Money {

    @Column(precision = 19, scale = 2)
    private BigDecimal amount;

    @Column(length = 3)
    private String currency; //ISO 4217

    /**
     * JPA 전용 기본 생성자
     */
    protected Money() {}

    public Money(BigDecimal amount, String currency) {
        if (amount == null) {
            throw new InvalidInputException("금액은 필수입니다");
        }
        if (currency == null) {
            throw new InvalidInputException("통화는 필수입니다");
        }

        // setScale 후에 범위 검증. 반대로 하면 반올림 결과가 검증을 빠져나간다
        BigDecimal scaled = amount.setScale(2, RoundingMode.HALF_UP);
        if (scaled.compareTo(BigDecimal.ZERO) < 0) {
            throw new InvalidInputException("금액은 0 이상이어야 합니다: " + amount);
        }

        this.amount = scaled;
        this.currency = normalizeCurrency(currency);
    }

    /**
     * ISO 4217 검증을 KRW/USD/JPY 화이트리스트로 하지 않는 이유 —
     * 스펙이 "통화를 늘릴 때 스키마·코드 변경이 없도록" enum을 뺐는데
     * 상수를 박으면 그 취지가 죽는다. java.util.Currency가 ISO 4217 목록을 이미 갖고 있다.
     */
    private static String normalizeCurrency(String currency) {
        String code = currency.strip().toUpperCase();
        try {
            Currency.getInstance(code);
        } catch (IllegalArgumentException e) {
            // Currency.getInstance가 던지는 표준 예외를 우리 타입으로 바꿔 단다
            throw new InvalidInputException("ISO 4217 통화 코드가 아닙니다: " + currency, e);
        }
        return code;
    }
}
