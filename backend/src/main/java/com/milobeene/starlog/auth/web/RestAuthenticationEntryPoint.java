package com.milobeene.starlog.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 인증이 없는 요청을 어떻게 돌려보낼지 결정한다.
 *
 * 기본값은 "브라우저면 로그인 폼으로 302, 아니면 401 Basic"이었다(I-1에서 관찰).
 * 프론트가 302를 받으면 로그인 HTML을 JSON으로 파싱하려다 이상하게 깨지므로 401로 통일한다.
 */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        JsonErrors.write(response, HttpStatus.UNAUTHORIZED.value(),
                "UNAUTHORIZED", "로그인이 필요합니다");
    }
}
