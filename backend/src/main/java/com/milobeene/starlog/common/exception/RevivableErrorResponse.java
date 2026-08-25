package com.milobeene.starlog.common.exception;

/**
 * 되살리기 안내 응답. 클라이언트가 확인을 받고 reviveUrl로 POST 하면 된다.
 * 기본 형태에 targetId·reviveUrl만 더한 것
 */
public record RevivableErrorResponse(
        String code,
        String message,
        Long targetId,
        String reviveUrl
) {
}
