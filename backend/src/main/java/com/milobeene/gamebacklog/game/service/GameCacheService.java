package com.milobeene.gamebacklog.game.service;

import com.milobeene.gamebacklog.game.client.CatalogGameDetail;
import com.milobeene.gamebacklog.game.domain.CatalogSyncCommand;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

/**
 * 온디맨드 캐시의 DB 쪽 절반 (J-3, FR-GAME-02·03).
 *
 * **외부 호출이 여기 없는 게 이 클래스의 존재 이유다.** 외부 호출은 GameResolver가 하고,
 * 여기는 트랜잭션을 짧게 열었다 닫는 일만 한다. 한 클래스에 합치면 HTTP 왕복 내내
 * DB 커넥션을 붙잡게 된다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GameCacheService {

    private final GameRepository gameRepository;

    /** 마스터에 이미 있나? 있으면 외부 DB를 안 부른다 (FR-GAME-03) */
    public Optional<Long> findCachedId(String externalId) {
        return gameRepository.findBySourceAndExternalId(GameSource.IGDB, externalId)
                .map(Game::getId);
    }

    /**
     * 외부 DB 상세를 마스터로 저장한다.
     *
     * 여기서 (source, external_id) 유니크 제약을 밟을 수 있다 — 두 회원이 같은 새 게임을
     * 동시에 담는 경우. 그 처리는 이 트랜잭션 안에서 못 한다(이미 롤백 표시가 붙는다).
     * 트랜잭션이 끝난 뒤인 GameResolver가 잡아서 재조회한다
     */
    /** 포트 DTO → 도메인 Command. 필드가 16개라 평평하게 넘기면 순서 실수를 못 잡는다 */
    public static CatalogSyncCommand toCommand(CatalogGameDetail detail) {
        return new CatalogSyncCommand(
                detail.developers(), detail.publishers(), detail.genres(), detail.releasedOn(),
                detail.coverImageId(), detail.bannerImageId(),
                detail.summary(), detail.storyline(),
                detail.igdbRating(), detail.igdbRatingCount(), detail.releasePlatforms(),
                detail.mainStoryHours(), detail.mainExtraHours(),
                detail.completionistHours(), detail.timeToBeatSamples());
    }

    @Transactional
    public Long save(CatalogGameDetail detail) {
        LocalDateTime now = LocalDateTime.now();

        Game game = Game.fromCatalog(detail.name(), detail.externalId(), now);
        game.syncFromCatalog(toCommand(detail), now);

        gameRepository.persist(game);

        return game.getId();
    }
}
