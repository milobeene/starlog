package com.milobeene.gamebacklog.backlog.dto;

/** 백로그에 담기 (FR-BL-01). 마스터 게임 id만 받는다 */
import jakarta.validation.constraints.NotNull;

public record BacklogAddRequest(@NotNull Long gameId) {
}
