package com.milobeene.starlog.admin.web;

import com.milobeene.starlog.admin.service.AuditLogService;
import com.milobeene.starlog.auth.security.MemberPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 관리자 행위를 기록한다 (NFR-S8 — **조회를 포함해서**).
 *
 * afterCompletion에서 남기는 이유 — 이 시점엔 요청 트랜잭션이 이미 끝나 있어
 * REQUIRES_NEW 기록이 롤백에 휩쓸리지 않는다.
 *
 * 기록 실패가 요청을 깨뜨리면 안 된다 — 삼키고 로그만 남긴다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AuditLogInterceptor implements HandlerInterceptor {

    private final AuditLogService auditLogService;

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !(authentication.getPrincipal() instanceof MemberPrincipal principal)) {
            return;
        }

        try {
            auditLogService.record(
                    principal.getMemberId(),
                    "%s %s".formatted(request.getMethod(), request.getRequestURI()),
                    "HTTP",
                    null,
                    request.getRemoteAddr(),
                    request.getHeader("User-Agent"));
        } catch (RuntimeException e) {
            log.warn("감사 로그 기록 실패: {} {}", request.getMethod(), request.getRequestURI(), e);
        }
    }
}
