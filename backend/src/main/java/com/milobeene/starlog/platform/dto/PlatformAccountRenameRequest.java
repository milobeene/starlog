package com.milobeene.starlog.platform.dto;

/** 계정 이름 변경. 플랫폼은 못 바꾼다 — 바꾸면 과거 기록의 의미가 뒤틀린다 */
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PlatformAccountRenameRequest(@NotBlank @Size(max = 50) String accountLabel) {
}
