package com.milobeene.starlog.member.dto;

/**
 * 프로필 수정 (FR-AUTH-11의 데이터 부분). 이메일·비밀번호는 Phase 3의 몫이다.
 * memo는 TEXT 컬럼이라 도메인 제한이 없다 — 2000은 규칙이 아니라 폭주 방지 상한 (메모류 공통)
 */
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProfileUpdateRequest(@NotBlank @Size(max = 30) String nickname,
                                   @Size(max = 2000) String memo) {
}
