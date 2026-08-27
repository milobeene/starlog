package com.milobeene.starlog.backlog.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * 개인 기록 전체 교체 (FR-BL-05~07).
 * 안 보낸 값은 지워진다 — 서비스가 부분 수정을 지원하지 않는다 (DTO 설계서 §5.1)
 */
public record PersonalRecordRequest(
        BigDecimal rating,          // 0.0~100.0 범위는 엔티티가 본다 (도메인 불변식)
        BigDecimal playTimeHours,      // 음수 금지도 엔티티가 본다
        /*
         * TEXT 컬럼이라 도메인 제한이 아니라 폭주 방지 상한이다.
         * 2000 → 5000: 옵시디언에서 옮겨온 감상 하나가 3166자였다. 상한 때문에 사용자가
         * 쓴 글을 잘라내는 건 순서가 뒤바뀐 것이라 상한을 올렸다
         */
        @Size(max = 5000) String memo
) {
}
