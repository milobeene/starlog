package com.milobeene.gamebacklog.backlog.dto;

import jakarta.validation.constraints.NotBlank;

/** 업로드 확정 (K-2). 서버는 업로드 성공 여부를 모르므로 클라이언트가 알려줘야 한다 */
public record CoverConfirmRequest(
        @NotBlank(message = "storageKey는 필수입니다")
        String storageKey) {
}
