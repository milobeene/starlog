package com.milobeene.starlog.auth.web;

import com.milobeene.starlog.auth.security.MemberPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 폼 로그인의 기본 동작은 성공 시 "원래 가려던 페이지로 302"다. API에는 안 맞아서 갈아끼운다.
 */
@Component
@lombok.RequiredArgsConstructor
public class LoginResultHandlers {

    private final CsrfTokenIssuer csrfTokenIssuer;

    /** 가입 승인제 (FR-ADM-06). 끄면 승인 없이도 로그인된다 */
    @Value("${app.signup.require-approval:false}")
    private boolean requireApproval;

    public AuthenticationSuccessHandler success() {
        return (request, response, authentication) -> {
            MemberPrincipal principal = (MemberPrincipal) authentication.getPrincipal();

            if (!principal.isEmailVerified()) {
                reject(request, response, "EMAIL_NOT_VERIFIED", "이메일 인증이 필요합니다");
                return;
            }
            /*
             * 승인 대기 차단 (FR-ADM-06). **세션을 아예 안 남기는 게 핵심이다** —
             * 세션이 없으면 /api/** 가 전부 401이라 DB 조회도 커버 업로드용 presigned URL 발급도
             * 따로 막을 필요가 없다.
             *
             * 이메일 미인증과 같은 이유로 비밀번호 대조 **뒤에** 검사한다 (아래 reject 주석)
             */
            if (requireApproval && !principal.isApproved()) {
                reject(request, response, "APPROVAL_PENDING",
                        "관리자 승인 후 이용하실 수 있습니다");
                return;
            }

            csrfTokenIssuer.issueFresh(request, response);
            response.setStatus(HttpStatus.OK.value());
            response.setContentType("application/json;charset=UTF-8");
            // 유예 중이면 프론트가 복구 화면으로 보내야 한다. 로그인 자체는 성공이다
            // role은 프론트가 /admin 라우트를 보일지 정하는 데 쓴다. 화면 숨김은 편의일 뿐
            // 진짜 방어선은 서버의 403이다
            response.getWriter().write(
                    "{\"id\":%d,\"email\":\"%s\",\"role\":\"%s\",\"withdrawalPending\":%b}"
                            .formatted(principal.getMemberId(), principal.getEmail(),
                                    principal.getRole().name(), principal.isWithdrawalPending()));
        };
    }

    /**
     * 로그인은 됐지만 아직 쓸 수 없는 계정을 끊는다 — 이메일 미인증(FR-AUTH-02),
     * 가입 승인 대기(FR-ADM-06).
     *
     * **왜 UserDetails.isEnabled()로 막지 않는가** — 그 검사는 비밀번호를 대조하기 **전에** 돈다.
     * 그러면 아무 비밀번호나 넣어보는 것만으로 "이 이메일은 가입돼 있다"는 사실이 새어나간다.
     * 비밀번호가 맞은 뒤에 막으면, 그 정보는 이미 비밀번호를 아는 사람에게만 보인다.
     *
     * 여기까지 왔다는 건 세션이 이미 만들어졌다는 뜻이라 되돌려놓고 나간다.
     */
    private void reject(HttpServletRequest request, HttpServletResponse response,
                        String code, String message)
            throws java.io.IOException {
        // 인증(비밀번호 대조)은 성공했으므로 CSRF 토큰은 이미 회전된 상태다
        csrfTokenIssuer.issueFresh(request, response);

        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();

        JsonErrors.write(response, HttpStatus.FORBIDDEN.value(), code, message);
    }

    /**
     * 실패 사유를 구분해서 알려주지 않는다 — "없는 계정"과 "비밀번호 틀림"이 다른 응답을 주면
     * 가입자 이메일 목록을 열거할 수 있다 (NFR-S3)
     */
    public AuthenticationFailureHandler failure() {
        return (request, response, exception) -> JsonErrors.write(
                response, HttpStatus.UNAUTHORIZED.value(),
                "AUTHENTICATION_FAILED", "이메일 또는 비밀번호가 올바르지 않습니다");
    }

    public LogoutSuccessHandler logoutSuccess() {
        return (request, response, authentication) -> {
            // 로그아웃은 CSRF 쿠키까지 지운다. 새로 안 주면 **다음 로그인이 403이 된다**
            csrfTokenIssuer.issueFresh(request, response);
            response.setStatus(HttpServletResponse.SC_NO_CONTENT);
        };
    }
}
