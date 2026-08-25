package com.milobeene.starlog.auth.web;

import com.milobeene.starlog.auth.security.MemberPrincipal;
import com.milobeene.starlog.member.repository.MemberRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * `X-Member-Id` 헤더를 로그인한 것처럼 취급하는 **dev·test 전용** 필터.
 *
 * 운영에는 이 빈 자체가 없다(@Profile). 프론트 껍데기와 기존 테스트가 세션 로그인 없이도
 * 돌아가게 하는 이행 장치이고, 세션이 이미 있으면 아무것도 하지 않는다.
 *
 * OncePerRequestFilter — forward/include로 같은 요청이 필터를 두 번 타는 것을 막아준다.
 * 서블릿 필터를 직접 구현할 때 사실상 기본 선택지다.
 */
@RequiredArgsConstructor
public class DevHeaderAuthenticationFilter extends OncePerRequestFilter {

    private static final String HEADER = "X-Member-Id";

    private final MemberRepository memberRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        String raw = request.getHeader(HEADER);
        boolean alreadyAuthenticated = SecurityContextHolder.getContext().getAuthentication() != null
                && SecurityContextHolder.getContext().getAuthentication().isAuthenticated()
                && SecurityContextHolder.getContext().getAuthentication().getPrincipal() instanceof MemberPrincipal;

        if (raw != null && !raw.isBlank() && !alreadyAuthenticated) {
            authenticateByHeader(raw);
        }

        filterChain.doFilter(request, response);
    }

    private void authenticateByHeader(String raw) {
        try {
            Long memberId = Long.valueOf(raw.strip());
            memberRepository.findById(memberId)
                    .map(MemberPrincipal::from)
                    .ifPresent(principal -> {
                        var authentication = UsernamePasswordAuthenticationToken.authenticated(
                                principal, null, principal.getAuthorities());
                        SecurityContext context = SecurityContextHolder.createEmptyContext();
                        context.setAuthentication(authentication);
                        SecurityContextHolder.setContext(context);
                    });
        } catch (NumberFormatException e) {
            // 헤더가 숫자가 아니면 그냥 인증 없이 통과시킨다 → 401이 난다
        }
    }
}
