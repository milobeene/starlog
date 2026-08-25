package com.milobeene.starlog.member.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 비밀번호 변경·설정 (BR-AUTH-01).
 *
 * `currentPassword`가 선택인 이유 — **구글로 가입한 계정은 비밀번호가 아예 없다.**
 * 그 경우 확인할 현재 값이 없으므로 처음 설정하는 경로로 쓴다.
 * 비밀번호가 있는 계정은 서비스가 현재 값을 반드시 검사한다
 */
public record PasswordChangeRequest(
        String currentPassword,

        @NotBlank(message = "새 비밀번호는 필수입니다")
        @Size(min = 4, max = 64, message = "비밀번호는 4자 이상 64자 이하여야 합니다")
        String newPassword) {
}
