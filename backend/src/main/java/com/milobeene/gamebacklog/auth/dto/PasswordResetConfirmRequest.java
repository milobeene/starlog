package com.milobeene.gamebacklog.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 비밀번호 규칙은 가입과 같아야 한다 — 여기만 느슨하면 재설정이 우회로가 된다 */
public record PasswordResetConfirmRequest(

        @NotBlank(message = "토큰은 필수입니다")
        String token,

        @NotBlank(message = "비밀번호는 필수입니다")
        @Size(min = 8, max = 64, message = "비밀번호는 8자 이상 64자 이하여야 합니다")
        String newPassword) {
}
