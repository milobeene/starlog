package com.milobeene.gamebacklog.game.client;

import java.time.LocalDate;

/**
 * RAWG 검색 결과 한 건 (J-2).
 *
 * 개발사·퍼블리셔가 없다 — RAWG 목록 응답이 안 준다. 그래서 담는 순간
 * 상세를 한 번 더 부른다(J-3). 온디맨드 캐시가 설계상 필연인 이유가 이것
 */
public record RawgGameSummary(
        String rawgId,
        String name,
        LocalDate releasedOn
) {
}
