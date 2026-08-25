package com.milobeene.starlog.backlog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/**
 * 업로드 허가증 요청 (K-2).
 *
 * 파일 자체가 아니라 **이름과 크기만** 받는다 — 파일은 브라우저가 스토리지로 직접 보낸다.
 * 여기 값들은 전부 클라이언트 주장이라, 확정 단계에서 실제 값으로 다시 검증한다 (K-3)
 */
public record CoverUploadUrlRequest(
        @NotBlank(message = "파일 이름은 필수입니다")
        String fileName,

        @Positive(message = "파일 크기가 올바르지 않습니다")
        long sizeBytes) {
}
