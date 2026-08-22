package com.milobeene.gamebacklog.game.dto;

import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;

import java.time.LocalDate;

/**
 * 게임 검색 결과 한 건 (J-2에서 외부 DB 결과까지 담도록 확장).
 *
 * **gameId와 externalId 중 최소 하나는 있다.**
 *   gameId != null → 이미 마스터에 있다. 담을 때 외부 호출 0회 (FR-GAME-03)
 *   gameId == null → 외부 DB에만 있다. 담는 순간 상세를 한 번 부르고 마스터에 저장 (FR-GAME-02)
 * 프론트는 둘을 그대로 POST /api/backlog에 실어 보내면 되고, 어느 쪽인지 판단하지 않아도 된다.
 *
 * coverImageId는 카드 썸네일용이다. URL이 아니라 id라서 크기를 프론트가 고른다 (§6.10)
 */
public record GameSearchResponse(
        Long gameId,
        String externalId,
        String name,
        LocalDate releasedOn,
        GameSource source,
        String coverImageId
) {

    /** 마스터에 이미 있는 게임 */
    public static GameSearchResponse from(Game game) {
        return new GameSearchResponse(game.getId(), game.getExternalId(), game.getName(),
                game.getReleasedOn(), game.getSource(), game.getCoverImageId());
    }

    /** 외부 DB에만 있는 게임. gameId가 없다 */
    public static GameSearchResponse fromCatalog(String externalId, String name,
                                                 LocalDate releasedOn, String coverImageId) {
        return new GameSearchResponse(null, externalId, name, releasedOn,
                GameSource.IGDB, coverImageId);
    }
}
