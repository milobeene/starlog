package com.milobeene.gamebacklog.game.dto;

import com.milobeene.gamebacklog.common.dto.MoneyRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

/**
 * 수동 등록 (FR-GAME-04, J-4).
 *
 * 이름 말고는 전부 선택이다 — "정보가 없는 상태를 정상으로 취급한다"(§6.2)가 마스터의 규칙이고,
 * 외부 DB에 없는 게임일수록 아는 게 적다. 정가만 여기 있고 외부 경로엔 없는 이유는
 * IGDB가 가격을 안 주기 때문이다
 */
public record ManualGameRequest(
        @NotBlank(message = "게임명은 필수입니다")
        @Size(max = 300, message = "게임명이 너무 깁니다")
        String name,

        List<String> developers,
        List<String> publishers,
        List<String> genres,
        LocalDate releasedOn,
        @Valid MoneyRequest listPrice) {
}
