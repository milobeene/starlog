package com.milobeene.gamebacklog.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 플랫폼·기기·에뮬레이터 공용 (FR-ADM-04) */
public record MasterNameRequest(
        @NotBlank(message = "이름은 필수입니다")
        @Size(max = 50, message = "이름은 50자 이하여야 합니다")
        String name) {
}
