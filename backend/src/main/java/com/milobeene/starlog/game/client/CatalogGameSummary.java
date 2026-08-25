package com.milobeene.starlog.game.client;

import java.time.LocalDate;

/**
 * 검색 결과 한 건 (J-2).
 *
 * 개발사·퍼블리셔가 없는 건 IGDB가 못 줘서가 아니다 — APIcalypse는 필드를 요청 시점에 고르므로
 * 달라면 준다. **일부러 안 받는다**: 20건마다 개발사·장르까지 실으면 응답이 무거워지는데
 * 실제로 담기는 건 1건이고, 그 1건은 어차피 담을 때 상세를 부른다 (J-3 온디맨드 캐시)
 */
public record CatalogGameSummary(
        String externalId,
        String name,
        LocalDate releasedOn,
        String coverImageId
) {
}
