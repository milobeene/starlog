package com.milobeene.gamebacklog.backlog.dto;

import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * 개인 기록 전체 교체 (FR-BL-05~07).
 * 안 보낸 값은 지워진다 — 서비스가 부분 수정을 지원하지 않는다 (DTO 설계서 §5.1)
 */
public record PersonalRecordRequest(
        BigDecimal rating,          // 0.0~100.0 범위는 엔티티가 본다 (도메인 불변식)
        Integer playTimeHours,      // 음수 금지도 엔티티가 본다
        @Size(max = 2000) String memo   // TEXT 컬럼. 2000은 폭주 방지 상한 (메모류 공통)
) {
}
