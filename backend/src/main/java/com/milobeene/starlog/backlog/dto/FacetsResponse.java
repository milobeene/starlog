package com.milobeene.starlog.backlog.dto;

import java.util.List;

/**
 * 필터 사이드바 (화면 1 부속, API 설계서 §1.2).
 *
 * §1.5의 options와 겹쳐 보이지만 다르다 —
 * facets는 **카운트가 있고 실제로 쓰이는 것만**, options는 **카운트가 없고 고를 수 있는 전부**다.
 * 삭제된 항목에만 붙은 태그·장르는 여기 안 나온다 (§6.7 자동 소멸)
 */
public record FacetsResponse(
        List<TagFacet> tags,
        List<FacetCount> genres,
        List<StatusCount> statuses,
        List<FacetCount> devices,
        List<FacetCount> platformAccounts
) {
}
