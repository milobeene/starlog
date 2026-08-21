package com.milobeene.gamebacklog.platform.dto;

/** 플랫폼 계정 등록 (FR-PLT-01). 같은 플랫폼에 여러 계정이 허용된다 (FR-PLT-02) */
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PlatformAccountCreateRequest(@NotNull Long platformId,
                                           @NotBlank @Size(max = 50) String accountLabel) {
}
