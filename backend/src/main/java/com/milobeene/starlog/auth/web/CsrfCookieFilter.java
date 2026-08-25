package com.milobeene.starlog.auth.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * CSRF 토큰 쿠키를 실제로 내려보내는 필터.
 *
 * 시큐리티 6부터 토큰 생성이 **지연**된다 — 아무도 토큰을 안 읽으면 만들지도, 쿠키로 내리지도
 * 않는다(세션 낭비 방지). 그래서 SPA는 토큰을 얻을 방법이 없어진다.
 * 여기서 getToken()을 한 번 호출해 강제로 만들게 하면 그때 쿠키가 응답에 실린다.
 */
public class CsrfCookieFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        CsrfToken csrfToken = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (csrfToken != null) {
            csrfToken.getToken();   // 이 한 줄이 쿠키를 내리게 한다
        }

        filterChain.doFilter(request, response);
    }
}
