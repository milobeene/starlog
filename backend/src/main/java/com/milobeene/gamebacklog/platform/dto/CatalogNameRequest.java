package com.milobeene.gamebacklog.platform.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 이름만 있는 선택지의 추가·수정 (플랫폼, 입력 방식) */
public record CatalogNameRequest(@NotBlank @Size(max = 50) String name) {
}
