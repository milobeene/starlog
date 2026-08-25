package com.milobeene.gamebacklog.platform.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 기기 추가·수정 (FR-PLT-03). 마스터 id를 고르는 게 아니라 직접 적는다.
 * memo는 마크다운 — 스펙이나 주의점을 자유롭게 쓴다
 */
public record DeviceRequest(@NotBlank @Size(max = 50) String deviceType,
                            @NotBlank @Size(max = 50) String label,
                            @Size(max = 2000) String memo) {
}
