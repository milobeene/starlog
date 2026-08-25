package com.milobeene.starlog.backlog.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

/** 취득 입력값 묶음. 금액은 amount가 null이면 통째로 없는 것으로 본다 */
public record AcquisitionCommand(
        AcquisitionMethod method,
        Long platformId,          // 실물 구매 등 계정이 없으면 platform만 (§6.6)
        Long platformAccountId,
        Long subscriptionId,      // method == SUBSCRIPTION일 때만 연결한다 (FR-ACQ-05)
        BigDecimal priceAmount,   // null 허용 — 금액은 모든 방식에서 선택
        String priceCurrency,
        LocalDate acquiredOn,
        String label              // "스위치판 재구매", "DLC - 쿠파 왕국"
) {
}
