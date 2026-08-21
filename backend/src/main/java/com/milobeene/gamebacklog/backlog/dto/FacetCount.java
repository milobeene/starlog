package com.milobeene.gamebacklog.backlog.dto;

/**
 * 필터 사이드바의 항목 하나 (API 설계서 §1.2).
 * JPQL 생성자 표현식(select new ...)으로 바로 만들어진다 — 엔티티를 로드하지 않는다
 */
public record FacetCount(Long id, String name, long count) {
}
