package com.milobeene.gamebacklog.game.dto;

import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;

import java.time.LocalDate;

/**
 * 마스터 게임 검색 결과 (H-3 신설).
 * 백로그에 담으려면 gameId가 필요한데 그걸 얻을 경로가 없어서 만들었다.
 * Phase 4(J-2)에서 RAWG 검색이 이 자리를 이어받는다
 */
public record GameSearchResponse(
        Long gameId,
        String name,
        LocalDate releasedOn,
        GameSource source
) {

    public static GameSearchResponse from(Game game) {
        return new GameSearchResponse(game.getId(), game.getName(),
                game.getReleasedOn(), game.getSource());
    }
}
