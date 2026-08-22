package com.milobeene.gamebacklog.auth.web;

import com.milobeene.gamebacklog.auth.security.MemberPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 구글로 떠나기 **직전에** "누가 연결을 시작했는지"를 세션에 적어둔다.
 *
 * 왜 필요한가 — 구글에서 돌아오면 시큐리티가 SecurityContext를 OAuth2 인증으로 갈아끼운다.
 * 그 시점에는 "원래 로그인해 있던 회원"이 이미 사라져서, 연결(link)인지 로그인(login)인지
 * 구분할 방법이 없다. 떠나기 전에 남겨두는 게 유일한 방법이다.
 */
public class GoogleLinkSessionFilter extends OncePerRequestFilter {

    public static final String LINK_MEMBER_ID = "GOOGLE_LINK_MEMBER_ID";
    private static final String AUTHORIZATION_PATH = "/oauth2/authorization/google";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        if (AUTHORIZATION_PATH.equals(request.getRequestURI())) {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null
                    && authentication.getPrincipal() instanceof MemberPrincipal principal) {
                request.getSession(true).setAttribute(LINK_MEMBER_ID, principal.getMemberId());
            }
        }

        filterChain.doFilter(request, response);
    }
}
