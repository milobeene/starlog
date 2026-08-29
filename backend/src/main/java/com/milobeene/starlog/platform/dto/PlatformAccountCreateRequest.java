package com.milobeene.starlog.platform.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 플랫폼 계정 등록 (FR-PLT-01). 같은 플랫폼에 여러 계정이 허용된다 (FR-PLT-02).
 *
 * ⚠️ **platformId와 emulatorId 중 하나만 온다** (v1.1). 에뮬레이터에도 계정이 있는
 * 경우가 있어서 자리를 열었다 — `@NotNull`을 뗀 이유가 이것이고, 대신 서비스가
 * "하나만"을 검사한다. 두 개짜리 규칙은 애너테이션으로 표현하기 어렵다
 */
public record PlatformAccountCreateRequest(Long platformId,
                                           Long emulatorId,
                                           @NotBlank @Size(max = 50) String accountLabel) {
}
