package com.milobeene.starlog.game.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record GameNameUpdateRequest(
        @NotBlank(message = "게임명은 필수입니다")
        @Size(max = 300, message = "게임명이 너무 깁니다")
        String name) {
}
