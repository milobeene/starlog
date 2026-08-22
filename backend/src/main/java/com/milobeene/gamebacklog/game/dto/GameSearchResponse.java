package com.milobeene.gamebacklog.game.dto;

import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;

import java.time.LocalDate;

/**
 * 게임 검색 결과 한 건 (J-2에서 RAWG 결과까지 담도록 확장).
 *
 * **gameId와 rawgId 중 최소 하나는 있다.**
 *   gameId != null → 이미 마스터에 있다. 담을 때 API 호출 0회 (FR-GAME-03)
 *   gameId == null → RAWG에만 있다. 담는 순간 상세를 한 번 부르고 마스터에 저장 (FR-GAME-02)
 * 프론트는 둘을 그대로 POST /api/backlog에 실어 보내면 되고, 어느 쪽인지 판단하지 않아도 된다
 */
public record GameSearchResponse(
        Long gameId,
        String rawgId,
        String name,
        LocalDate releasedOn,
        GameSource source
) {

    /** 마스터에 이미 있는 게임 */
    public static GameSearchResponse from(Game game) {
        return new GameSearchResponse(game.getId(), game.getExternalId(), game.getName(),
                game.getReleasedOn(), game.getSource());
    }

    /** RAWG에만 있는 게임. gameId가 없다 */
    public static GameSearchResponse fromRawg(String rawgId, String name, LocalDate releasedOn) {
        return new GameSearchResponse(null, rawgId, name, releasedOn, GameSource.RAWG);
    }
}
