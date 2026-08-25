package com.milobeene.starlog.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 가입 요청 (FR-AUTH-01).
 *
 * 비밀번호 상한이 64인 이유 — BCrypt는 **72바이트를 넘는 부분을 조용히 무시한다.**
 * 넉넉히 잡아두면 "긴 비밀번호를 넣었는데 앞 72바이트만 맞으면 로그인되는" 상황이 생긴다.
 */
public record SignUpRequest(

        @NotBlank(message = "이메일은 필수입니다")
        @Email(message = "이메일 형식이 아닙니다")
        @Size(max = 320, message = "이메일이 너무 깁니다")
        String email,

        @NotBlank(message = "비밀번호는 필수입니다")
        @Size(min = 4, max = 64, message = "비밀번호는 4자 이상 64자 이하여야 합니다")
        String password,

        @NotBlank(message = "닉네임은 필수입니다")
        @Size(max = 30, message = "닉네임은 30자 이하여야 합니다")
        String nickname) {
}
