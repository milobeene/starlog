package com.milobeene.starlog.auth.web;

import com.milobeene.starlog.auth.security.MemberPrincipal;
import com.milobeene.starlog.auth.service.GoogleAccountService;
import com.milobeene.starlog.auth.service.MailProperties;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.member.domain.Member;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Optional;

/**
 * 구글에서 돌아왔을 때의 분기 (FR-AUTH-06, 07).
 *
 * 세 갈래가 같은 콜백으로 들어온다.
 *  · 세션에 연결 요청자가 있다        → **연결**
 *  · 이 sub로 연결된 회원이 있다      → **로그인**
 *  · 둘 다 아니다                    → **가입** (FR-AUTH-12)
 *
 * 가입에서 이메일이 이미 있으면 **이어붙이지 않고 409로 거부한다** — 자동 연결은
 * 계정 탈취 경로다 (§6.1). "로그인 후 설정에서 연결하라"고 안내한다.
 *
 * 끝에서 SecurityContext를 우리 `MemberPrincipal`로 **갈아끼우는 게 핵심**이다.
 * OAuth2User를 그대로 두면 `@LoginMember` 리졸버가 회원 id를 못 꺼낸다.
 */
@Component
@RequiredArgsConstructor
public class GoogleOAuth2SuccessHandler implements AuthenticationSuccessHandler {

    /*
     * MemberService가 아니라 GoogleAccountService로 회원을 읽는 이유 — MemberService는
     * passwordEncoder를 물고, 그 빈은 이 핸들러를 주입받는 SecurityConfig가 정의한다.
     * MemberService를 넣으면 순환 참조로 기동이 실패한다
     */
    private final GoogleAccountService googleAccountService;
    private final CsrfTokenIssuer csrfTokenIssuer;
    private final MailProperties mailProperties;   // frontendBaseUrl을 재사용한다

    /** 가입 승인제 (FR-ADM-06). 폼 로그인 쪽(LoginResultHandlers)과 같은 스위치를 본다 */
    @org.springframework.beans.factory.annotation.Value("${app.signup.require-approval:false}")
    private boolean requireApproval;

    private final SecurityContextRepository securityContextRepository =
            new HttpSessionSecurityContextRepository();

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException {

        String googleSubject = ((OAuth2User) authentication.getPrincipal()).getName();
        Long linkMemberId = popLinkRequester(request);

        if (linkMemberId != null) {
            /*
             * 이 시점의 세션에는 시큐리티가 방금 저장한 **OAuth2 인증**이 들어 있다
             * (필터가 성공 핸들러를 부르기 전에 세션에 저장한다). 그대로 두면 연결에
             * 성공하고도 이후 모든 /api/** 요청이 ROLE_USER가 없어 403이 된다.
             * 성공이든 충돌이든 원래 회원의 세션으로 되돌려야 한다.
             *
             * ConflictException(이미 다른 계정에 연결된 구글 계정)을 여기서 잡는 이유 —
             * 성공 핸들러는 필터 계층이라 @RestControllerAdvice가 못 잡는다. 안 잡으면 500이다
             */
            try {
                googleAccountService.link(linkMemberId, googleSubject);
            } catch (ConflictException e) {
                establishSession(request, response,
                        MemberPrincipal.from(googleAccountService.findOne(linkMemberId)));
                csrfTokenIssuer.issueFresh(request, response);
                OAuthRedirects.withResult(response, mailProperties.frontendBaseUrl(),
                        "/settings", "ALREADY_LINKED");
                return;
            }
            establishSession(request, response,
                    MemberPrincipal.from(googleAccountService.findOne(linkMemberId)));
            csrfTokenIssuer.issueFresh(request, response);
            OAuthRedirects.withResult(response, mailProperties.frontendBaseUrl(),
                    "/settings", "LINKED");
            return;
        }

        OAuth2User user = (OAuth2User) authentication.getPrincipal();
        Optional<Member> linked = googleAccountService.findLinked(googleSubject);

        Member member = linked.orElse(null);
        if (member == null) {
            member = signUpOrReject(request, response, user, googleSubject);
            if (member == null) {
                return;   // 이미 응답을 썼다
            }
        }

        if (!member.isEmailVerified()) {
            // 이메일 가입과 같은 규칙이다 (FR-AUTH-02). 구글이 email_verified: false를 준 경우
            rejectBeforeSession(request, response, "EMAIL_NOT_VERIFIED");
            return;
        }

        /*
         * 승인 대기 차단 (FR-ADM-06). **여기를 빼먹으면 승인제가 통째로 우회된다** —
         * 구글 로그인은 폼 로그인과 다른 경로라 LoginResultHandlers를 타지 않는다.
         * 방금 가입한 사람도 여기로 떨어져 "승인 대기" 안내를 받는다
         */
        if (requireApproval && !member.isApproved()) {
            rejectBeforeSession(request, response, "APPROVAL_PENDING");
            return;
        }

        authenticateAsMember(request, response, MemberPrincipal.from(member));
    }

    /** 세션을 남기지 않고 프론트로 사유를 실어 돌려보낸다 */
    private void rejectBeforeSession(HttpServletRequest request, HttpServletResponse response,
                                     String reason) throws IOException {
        SecurityContextHolder.clearContext();
        csrfTokenIssuer.issueFresh(request, response);
        OAuthRedirects.withResult(response, mailProperties.frontendBaseUrl(), "/login", reason);
    }

    /** 가입 시도. 거부하면 응답을 직접 쓰고 null을 돌려준다 */
    private Member signUpOrReject(HttpServletRequest request, HttpServletResponse response,
                                  OAuth2User user, String googleSubject) throws IOException {
        String email = user.getAttribute("email");
        if (email == null || email.isBlank()) {
            SecurityContextHolder.clearContext();
            OAuthRedirects.withResult(response, mailProperties.frontendBaseUrl(),
                    "/login", "EMAIL_REQUIRED");
            return null;
        }

        try {
            return googleAccountService.signUp(
                    googleSubject,
                    email,
                    Boolean.TRUE.equals(user.getAttribute("email_verified")),
                    user.getAttribute("name"));
        } catch (ConflictException e) {
            SecurityContextHolder.clearContext();
            csrfTokenIssuer.issueFresh(request, response);
            OAuthRedirects.withResult(response, mailProperties.frontendBaseUrl(),
                    "/login", "EMAIL_ALREADY_REGISTERED");
            return null;
        }
    }

    /** 세션의 인증을 우리 MemberPrincipal로 갈아끼운다. 로그인·연결 두 브랜치가 공유한다 */
    private void establishSession(HttpServletRequest request, HttpServletResponse response,
                                  MemberPrincipal principal) {
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                principal, null, principal.getAuthorities()));
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }

    private Long popLinkRequester(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return null;
        }
        Object memberId = session.getAttribute(GoogleLinkSessionFilter.LINK_MEMBER_ID);
        session.removeAttribute(GoogleLinkSessionFilter.LINK_MEMBER_ID);   // 1회용
        return (Long) memberId;
    }

    private void authenticateAsMember(HttpServletRequest request, HttpServletResponse response,
                                      MemberPrincipal principal) throws IOException {
        establishSession(request, response, principal);

        csrfTokenIssuer.issueFresh(request, response);

        // 유예 중 계정은 복구 화면 말고는 전부 403이라 다른 데로 보내면 막힌다 (FR-AUTH-10)
        OAuthRedirects.toApp(response, mailProperties.frontendBaseUrl(),
                principal.isWithdrawalPending() ? "/restore" : "/dashboard");
    }
}
