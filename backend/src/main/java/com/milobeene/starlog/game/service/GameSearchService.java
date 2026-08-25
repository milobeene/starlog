package com.milobeene.starlog.game.service;

import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.game.client.CatalogGameSummary;
import com.milobeene.starlog.game.client.GameCatalogClient;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.domain.GameSource;
import com.milobeene.starlog.game.dto.GameSearchResponse;
import com.milobeene.starlog.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 게임 검색 (J-2, FR-GAME-01).
 *
 * 결과는 두 갈래를 이어 붙인다:
 *   1. 로컬 수동 등록 게임 — 외부 DB에 없어서 누군가 손으로 넣은 것들 (FR-GAME-04)
 *   2. IGDB 검색 결과 — 이미 마스터에 있으면 gameId를 채워준다
 *
 * **클래스 레벨 @Transactional을 일부러 안 붙였다.** 이 메서드 한가운데에 외부 HTTP 호출이 있다.
 * 트랜잭션으로 감싸면 외부가 3초 걸릴 때 DB 커넥션을 3초 붙잡고 있는 셈이고,
 * 커넥션 풀이 먼저 마른다. 리포지토리 호출은 각자 자기 트랜잭션에서 돈다
 * (SimpleJpaRepository가 readOnly 트랜잭션을 이미 걸고 있다)
 */
@Service
@RequiredArgsConstructor
public class GameSearchService {

    private static final int MANUAL_LIMIT = 10;

    private final GameCatalogClient catalogClient;
    private final GameRepository gameRepository;

    public List<GameSearchResponse> search(String keyword) {
        String normalized = TextValues.normalize(keyword);
        if (normalized == null) {
            // 검색어가 비면 전체를 퍼주지 않는다. RAWG 호출도 하지 않는다
            return List.of();
        }

        List<Game> manual = gameRepository.searchByNameAndSource(
                normalized, GameSource.MANUAL, PageRequest.ofSize(MANUAL_LIMIT));

        // 이 줄에서 실패하면 502로 끝난다 (J-6). 로컬 결과만 조용히 돌려주지 않는 이유 —
        // 사용자는 "외부 DB에 없는 게임"으로 오해하고 수동 등록으로 가버린다
        List<CatalogGameSummary> remote = catalogClient.search(normalized);
        Map<String, Game> cached = cachedByExternalId(remote);

        return Stream.concat(
                        manual.stream().map(GameSearchResponse::from),
                        remote.stream().map(summary -> toResponse(summary, cached)))
                .toList();
    }

    private GameSearchResponse toResponse(CatalogGameSummary summary, Map<String, Game> cached) {
        Game game = cached.get(summary.externalId());
        if (game == null) {
            return GameSearchResponse.fromCatalog(summary.externalId(), summary.name(),
                    summary.releasedOn(), summary.coverImageId());
        }
        // 마스터에 있으면 마스터 값이 이긴다 — 관리자가 고친 이름·출시일이 원본으로 되돌아가면 안 된다
        return GameSearchResponse.from(game);
    }

    /**
     * 검색 결과 전체의 externalId를 한 방에 조회한다. 건별로 findBySourceAndExternalId를
     * 20번 부르면 그게 N+1이다. 엔티티까지 들고 오는 이유는 이름·출시일을 마스터 값으로 쓰기 위해서
     */
    private Map<String, Game> cachedByExternalId(List<CatalogGameSummary> remote) {
        List<String> externalIds = remote.stream().map(CatalogGameSummary::externalId).toList();
        if (externalIds.isEmpty()) {
            return Map.of();
        }

        return gameRepository.findBySourceAndExternalIdIn(GameSource.IGDB, externalIds).stream()
                .collect(Collectors.toMap(
                        Game::getExternalId, game -> game, (first, second) -> first));
    }
}
