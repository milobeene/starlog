package com.milobeene.starlog.game.service;

import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.game.client.CatalogGameDetail;
import com.milobeene.starlog.game.client.GameCatalogClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * "이 요청이 가리키는 마스터 게임의 id는 무엇인가"를 하나로 답한다 (J-3).
 *
 *   gameId가 왔다             → 그대로 쓴다. 외부 호출 0회
 *   externalId가 왔고 캐시됨 → 캐시된 id. 외부 호출 0회 (FR-GAME-03)
 *   externalId가 왔고 없음   → 상세 1회 호출 → 마스터 저장 → 그 id (FR-GAME-02)
 *
 * **이 클래스에 @Transactional이 없는 것이 설계의 핵심이다.** 트랜잭션은 GameCacheService가
 * 짧게 열고, 그 바깥에서 HTTP를 왕복한다. 반대로 짰다면 외부 지연이 곧 커넥션 고갈이다.
 * 두 빈으로 나눈 이유도 같다 — 같은 객체 안에서 부르면 프록시를 안 거쳐 @Transactional이 안 먹는다
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GameResolver {

    private final GameCatalogClient catalogClient;
    private final GameCacheService gameCacheService;

    public Long resolve(Long gameId, String externalId) {
        if (gameId != null) {
            // 존재 여부는 여기서 안 본다. 뒤이어 부르는 BacklogService가 어차피 findById로 확인하고,
            // 두 곳에서 확인하면 없는 게임일 때 쿼리가 두 번 나간다
            return gameId;
        }

        String normalized = TextValues.normalize(externalId);
        if (normalized == null) {
            throw new InvalidInputException("gameId 또는 externalId 중 하나는 필요합니다");
        }

        Optional<Long> cached = gameCacheService.findCachedId(normalized);
        if (cached.isPresent()) {
            return cached.get();
        }

        CatalogGameDetail detail = catalogClient.findById(normalized);

        try {
            return gameCacheService.save(detail);

        } catch (DataIntegrityViolationException e) {
            /*
             * 두 회원이 같은 새 게임을 같은 순간에 담았다. 앱 검증(findCachedId)은 최선 노력이고
             * 진짜 방어선은 DB 유니크 제약이다 — 여기 온 시점에 상대가 이미 저장을 끝냈다.
             * 실패로 처리할 이유가 없다. 상대가 넣은 행을 그대로 쓴다
             */
            log.info("동시 캐시 저장 충돌 — 이미 저장된 마스터를 재사용합니다. externalId={}", normalized);

            return gameCacheService.findCachedId(normalized)
                    .orElseThrow(() -> e);
        }
    }
}
