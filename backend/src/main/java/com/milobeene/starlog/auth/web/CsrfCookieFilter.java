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
 *
 * **헤더로도 같이 내려주는 이유 (O-3, 크로스 도메인 배포)** — `document.cookie`는 그 문서의
 * 도메인이 심은 쿠키만 읽는다. 프론트(*.vercel.app)에서 도는 JS는 백엔드(*.onrender.com)가
 * 내려준 XSRF-TOKEN 쿠키를 **읽을 수 없다.** 그러면 헤더를 못 붙여 쓰기 요청이 전부 403이 된다.
 * 로컬에서 안 드러난 건 쿠키가 포트를 구분하지 않아 localhost:3000과 :8080이 같은 저장소를
 * 쓰기 때문이다 — 배포 전에는 원리적으로 관측 불가능한 부류다.
 *
 * 쿠키는 그대로 둔다. 대조는 여전히 쿠키 ↔ 헤더로 하고(브라우저가 쿠키를 자동으로 싣는다),
 * 헤더는 JS에게 **값을 알려주는 용도**일 뿐이다. CorsConfig가 이 헤더를 노출해야 읽힌다
 */
public class CsrfCookieFilter extends OncePerRequestFilter {

    /** 요청에 실어 보낼 헤더 이름과 같다. 프론트가 이 이름으로 읽고 이 이름으로 되돌려준다 */
    public static final String HEADER = "X-XSRF-TOKEN";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        CsrfToken csrfToken = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (csrfToken != null) {
            // 이 한 줄이 쿠키를 내리게 한다. 헤더는 체인을 타기 전에 박아야 한다 —
            // 응답이 커밋된 뒤에 setHeader를 부르면 조용히 무시된다
            response.setHeader(HEADER, csrfToken.getToken());
        }

        filterChain.doFilter(request, response);
    }
}
