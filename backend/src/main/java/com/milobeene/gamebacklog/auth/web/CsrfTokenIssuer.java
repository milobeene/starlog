package com.milobeene.gamebacklog.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.stereotype.Component;

/**
 * 응답에 **새 CSRF 토큰을 강제로 실어주는** 창구.
 *
 * 왜 필요한가 — 시큐리티는 다음 순간마다 기존 토큰을 폐기한다.
 *   · 로그인 성공     (세션 고정 공격 방어의 일부로 토큰 회전)
 *   · 로그아웃        (CsrfLogoutHandler가 쿠키 삭제)
 *   · 세션 강제 만료  (비밀번호 재설정·탈퇴로 우리가 끊었을 때)
 *
 * 폐기까지는 맞는데, 이 응답들은 **필터 체인을 중간에 끊고 나가기 때문에** 쿠키를 다시
 * 내려주는 CsrfCookieFilter가 돌지 않는다. 그러면 클라이언트는 토큰 없는 상태가 되고
 * 다음 쓰기 요청이 전부 403이 된다 — 로그아웃 직후 로그인조차 못 하게 된다.
 *
 * 요청 속성에 남은 토큰을 읽는 것으로는 부족하다(이미 삭제된 뒤다). 새로 만들어 저장한다.
 */
@Component
@RequiredArgsConstructor
public class CsrfTokenIssuer {

    private final CsrfTokenRepository csrfTokenRepository;

    public void issueFresh(HttpServletRequest request, HttpServletResponse response) {
        CsrfToken fresh = csrfTokenRepository.generateToken(request);
        csrfTokenRepository.saveToken(fresh, request, response);
    }
}
