package com.milobeene.starlog.auth.dto;

import jakarta.validation.constraints.NotBlank;

public record EmailVerificationRequest(@NotBlank(message = "토큰은 필수입니다") String token) {
}
