package com.milobeene.gamebacklog.game.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;

import java.util.Optional;

public interface GameRepository extends BaseRepository<Game, Long> {

    /**
     * RAWG에서 가져온 게임이 이미 있는지 확인 (uk_game_source_external_id).
     * 메서드 이름을 파싱해서 JPQL을 만들어준다 — findBy + Source + And + ExternalId
     */
    Optional<Game> findBySourceAndExternalId(GameSource source, String externalId);
}
