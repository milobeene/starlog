package com.milobeene.gamebacklog.backlog.dto;

/**
 * 사이드바 전체 목록 (Phase 8, 화면 1 부속).
 *
 * 카드 DTO를 재활용하지 않는 이유 — 사이드바는 이름만 쓰는데
 * 카드는 game·lastPlaythrough·기기 join fetch 3방을 끌고 온다
 */
public record BacklogNameResponse(Long entryId, String displayName) {
}
