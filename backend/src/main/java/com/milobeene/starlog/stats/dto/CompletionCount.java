package com.milobeene.starlog.stats.dto;

/**
 * 기간별 완료 수 (FR-STAT-02).
 *
 * period는 `2026-03`(월별) 또는 `2026`(연별)이다. 문자열로 내리는 이유 —
 * 화면이 그대로 축 라벨로 쓰고, 월별/연별을 한 타입으로 받을 수 있다
 */
public record CompletionCount(String period, long count) {
}
