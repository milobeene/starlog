package com.milobeene.gamebacklog.stats.dto;

/** 장르별 게임 수 (FR-STAT-01). 개인 장르 우선, 없으면 마스터 폴백 (§6.7) */
public record GenreDistribution(String genre, long count) {
}
