package com.milobeene.gamebacklog.common.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * 페이징 응답. Spring의 Page를 그대로 직렬화하지 않는 이유 —
 * pageable·sort 같은 내부 구조가 응답에 노출되고 Spring 버전에 묶인다 (API 설계서 §4.3).
 *
 * 필드 순서가 곧 JSON 키 순서다. API 설계서 §1.1의 약속과 맞춰뒀다
 */
public record PageResponse<T>(
        int page,
        int size,
        long totalElements,
        int totalPages,
        List<T> items
) {

    /**
     * Page의 내용은 **이미 DTO여야 한다.**
     * 호출부에서 `PageResponse.from(page.map(XxxResponse::from))` 형태로 쓴다 —
     * Page.map()이 트랜잭션 안에서 돌아야 LAZY 로딩이 살아있다
     */
    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.getContent()
        );
    }
}
