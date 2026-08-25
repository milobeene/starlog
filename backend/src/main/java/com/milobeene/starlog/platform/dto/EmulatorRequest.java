package com.milobeene.starlog.platform.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 에뮬레이터 추가·수정 (FR-PLT-04). memo는 마크다운 — 설정값·주의점 */
public record EmulatorRequest(@NotBlank @Size(max = 50) String name,
                              @Size(max = 2000) String memo) {
}
