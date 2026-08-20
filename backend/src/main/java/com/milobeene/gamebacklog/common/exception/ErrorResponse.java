package com.milobeene.gamebacklog.common.exception;

/** 모든 실패 응답의 기본 형태 */
public record ErrorResponse(String code, String message) {
}
