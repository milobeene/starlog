package com.milobeene.starlog.backlog.dto;

/**
 * 태그 파셋 (v1.2).
 *
 * `FacetCount`에 색 하나가 더 붙는다. 공용 레코드에 넣지 않은 이유 —
 * **장르·기기·계정에는 색이 없다.** 넣으면 세 곳이 늘 null을 채워야 하고,
 * "이 필드는 태그일 때만 의미가 있다"를 주석으로만 알려야 한다.
 */
public record TagFacet(Long id, String name, long count, String color) {
}
