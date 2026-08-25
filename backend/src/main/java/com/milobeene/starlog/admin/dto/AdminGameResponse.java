package com.milobeene.starlog.admin.dto;

import com.milobeene.starlog.game.domain.Game;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 관리자 마스터 게임 목록 (FR-ADM-01).
 *
 * 담기 화면의 `GameSearchResponse`와 모양이 비슷하지만 **다른 물건이다** —
 * 저쪽은 IGDB 결과를 섞어 주느라 gameId가 null일 수 있고, 여기는 마스터만이라 항상 있다.
 * 대신 관리자에게 필요한 `lastSyncedAt`(언제 IGDB와 맞췄나)이 붙는다
 */
public record AdminGameResponse(
        Long gameId,
        String name,
        String source,
        String externalId,
        LocalDate releasedOn,
        String coverImageId,
        LocalDateTime lastSyncedAt) {

    public static AdminGameResponse from(Game game) {
        return new AdminGameResponse(
                game.getId(), game.getName(), game.getSource().name(), game.getExternalId(),
                game.getReleasedOn(), game.getCoverImageId(), game.getLastSyncedAt());
    }
}
