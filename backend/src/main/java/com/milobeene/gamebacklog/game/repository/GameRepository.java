package com.milobeene.gamebacklog.game.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

import java.util.Optional;

public interface GameRepository extends BaseRepository<Game, Long> {

    /**
     * RAWG에서 가져온 게임이 이미 있는지 확인 (uk_game_source_external_id).
     * 메서드 이름을 파싱해서 JPQL을 만들어준다 — findBy + Source + And + ExternalId
     */
    Optional<Game> findBySourceAndExternalId(GameSource source, String externalId);

    /**
     * 이름 부분 일치 검색 (H-3). 로컬 마스터만 뒤진다.
     *
     * like '%...%'는 인덱스를 못 탄다. 지금은 마스터가 작아서 괜찮고,
     * 규모가 커지면 Phase 6에서 다룬다 — 여기서 불편을 겪는 게 L-1의 동기가 된다
     */
    @Query("select g from Game g" +
            " where lower(g.name) like lower(concat('%', :keyword, '%'))" +
            " order by g.name asc")
    List<Game> searchByName(@Param("keyword") String keyword, Pageable pageable);
}
