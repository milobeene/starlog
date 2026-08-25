package com.milobeene.starlog.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record ResendRequest(
        @NotBlank(message = "이메일은 필수입니다")
        @Email(message = "이메일 형식이 아닙니다")
        String email) {
}
