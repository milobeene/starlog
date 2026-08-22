package com.milobeene.gamebacklog.game.service;

import com.milobeene.gamebacklog.game.client.RawgGameDetail;
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
 * **외부 호출이 여기 없는 게 이 클래스의 존재 이유다.** RAWG 호출은 GameResolver가 하고,
 * 여기는 트랜잭션을 짧게 열었다 닫는 일만 한다. 한 클래스에 합치면 HTTP 왕복 내내
 * DB 커넥션을 붙잡게 된다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GameCacheService {

    private final GameRepository gameRepository;

    /** 마스터에 이미 있나? 있으면 RAWG를 안 부른다 (FR-GAME-03) */
    public Optional<Long> findCachedId(String rawgId) {
        return gameRepository.findBySourceAndExternalId(GameSource.RAWG, rawgId)
                .map(Game::getId);
    }

    /**
     * RAWG 상세를 마스터로 저장한다.
     *
     * 여기서 (source, external_id) 유니크 제약을 밟을 수 있다 — 두 회원이 같은 새 게임을
     * 동시에 담는 경우. 그 처리는 이 트랜잭션 안에서 못 한다(이미 롤백 표시가 붙는다).
     * 트랜잭션이 끝난 뒤인 GameResolver가 잡아서 재조회한다
     */
    @Transactional
    public Long save(RawgGameDetail detail) {
        LocalDateTime now = LocalDateTime.now();

        Game game = Game.fromRawg(detail.name(), detail.rawgId(), now);
        game.syncFromRawg(detail.developers(), detail.publishers(), detail.genres(),
                detail.releasedOn(), detail.averagePlaytimeHours(), now);

        gameRepository.persist(game);

        return game.getId();
    }
}
