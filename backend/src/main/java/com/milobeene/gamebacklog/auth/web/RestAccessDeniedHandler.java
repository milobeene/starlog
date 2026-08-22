package com.milobeene.gamebacklog.auth.web;

import com.milobeene.gamebacklog.admin.service.AuditLogService;
import com.milobeene.gamebacklog.auth.security.MemberPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 401과 403의 차이 — 401은 "네가 누군지 모르겠다", 403은 "누군지는 알지만 권한이 없다".
 * CSRF 토큰 누락도 여기로 온다 (인증은 됐는데 요청이 신뢰할 수 없는 경우).
 */
@Component
@RequiredArgsConstructor
public class RestAccessDeniedHandler implements AccessDeniedHandler {

    private final AuditLogService auditLogService;

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        recordDeniedAdminAttempt(request);

        JsonErrors.write(response, HttpStatus.FORBIDDEN.value(),
                "FORBIDDEN", "권한이 없습니다");
    }

    /**
     * 관리자 경로에 대한 **거부된 시도**도 남긴다 (NFR-S8).
     *
     * 인터셉터로는 못 잡는다 — 인가 거부는 필터 단계라 DispatcherServlet에 도달하지 않고,
     * 그러면 HandlerInterceptor가 아예 호출되지 않는다. "누가 관리자 API를 두드렸다"는
     * 성공 기록보다 오히려 더 중요한 신호라 여기서 따로 남긴다.
     */
    private void recordDeniedAdminAttempt(HttpServletRequest request) {
        if (!request.getRequestURI().startsWith("/api/admin/")) {
            return;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
                && authentication.getPrincipal() instanceof MemberPrincipal principal) {
            auditLogService.record(
                    principal.getMemberId(),
                    "DENIED %s %s".formatted(request.getMethod(), request.getRequestURI()),
                    "HTTP", null, request.getRemoteAddr(), request.getHeader("User-Agent"));
        }
    }
}
