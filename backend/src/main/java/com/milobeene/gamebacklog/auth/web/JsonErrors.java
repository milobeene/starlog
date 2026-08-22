package com.milobeene.gamebacklog.auth.web;

import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

/**
 * 시큐리티 필터는 컨트롤러 밖이라 @RestControllerAdvice가 안 잡는다.
 * 그래서 이 계층의 응답은 직접 써야 하고, 형태만 ErrorResponse(code, message)와 맞춘다.
 */
public final class JsonErrors {

    private JsonErrors() {}

    public static void write(HttpServletResponse response, int status, String code, String message)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"code\":\"%s\",\"message\":\"%s\"}".formatted(code, message));
    }
}
