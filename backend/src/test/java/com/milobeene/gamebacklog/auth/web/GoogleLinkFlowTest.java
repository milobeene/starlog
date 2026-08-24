package com.milobeene.gamebacklog.auth.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.gamebacklog.auth.security.MemberPrincipal;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;

import java.util.List;
import java.util.Map;

/**
 * 구글 계정 연결 분기 (FR-AUTH-06)의 **세션 상태** 검증.
 *
 * 시큐리티는 성공 핸들러를 부르기 전에 세션 인증을 OAuth2User로 갈아끼운다.
 * link 브랜치가 그걸 MemberPrincipal로 되돌리지 않으면, 연결에 성공하고도
 * 이후 모든 /api/** 요청이 403이 된다 — 실제로 이 버그가 있었다.
 */
class GoogleLinkFlowTest extends ControllerTestSupport {

    @Autowired GoogleOAuth2SuccessHandler handler;

    @Test
    public void 구글_연결_후에도_세션은_회원_로그인으로_남는다() throws Exception {
        //given — 연결을 시작한 회원 (GoogleLinkSessionFilter가 남기는 표식)
        Member member = saveMember();
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.getSession(true).setAttribute(GoogleLinkSessionFilter.LINK_MEMBER_ID, member.getId());

        //when — 구글에서 돌아온 순간
        handler.onAuthenticationSuccess(request, response, googleAuthentication("sub-123"));

        //then — 연결됐고, 세션 인증이 OAuth2User가 아니라 우리 회원이다
        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(reload(member).getGoogleSubject()).isEqualTo("sub-123");
        assertThat(sessionPrincipal(request).getMemberId()).isEqualTo(member.getId());
    }

    @Test
    public void 이미_연결된_구글_계정이면_409를_주고_원래_로그인은_유지된다() throws Exception {
        //given — 같은 sub가 이미 다른 회원에 연결돼 있다
        Member owner = saveMember();
        owner.linkGoogle("sub-dup");
        Member requester = saveMember();
        em.flush();

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.getSession(true).setAttribute(GoogleLinkSessionFilter.LINK_MEMBER_ID, requester.getId());

        //when
        handler.onAuthenticationSuccess(request, response, googleAuthentication("sub-dup"));

        //then — 500이 아니라 409. 시도한 회원의 세션은 깨지지 않는다
        assertThat(response.getStatus()).isEqualTo(409);
        assertThat(reload(requester).getGoogleSubject()).isNull();
        assertThat(sessionPrincipal(request).getMemberId()).isEqualTo(requester.getId());
    }

    private Member reload(Member member) {
        em.flush();
        em.clear();
        return em.find(Member.class, member.getId());
    }

    /** 시큐리티가 세션에 저장하는 키에서 인증을 꺼낸다 */
    private MemberPrincipal sessionPrincipal(MockHttpServletRequest request) {
        SecurityContext saved = (SecurityContext) request.getSession()
                .getAttribute("SPRING_SECURITY_CONTEXT");
        assertThat(saved).isNotNull();
        assertThat(saved.getAuthentication().getPrincipal()).isInstanceOf(MemberPrincipal.class);
        return (MemberPrincipal) saved.getAuthentication().getPrincipal();
    }

    /** 구글 콜백 시점의 인증 — DefaultOAuth2User.getName()이 sub를 돌려준다 */
    private Authentication googleAuthentication(String sub) {
        OAuth2User user = new DefaultOAuth2User(
                List.of(new SimpleGrantedAuthority("OAUTH2_USER")),
                Map.of("sub", sub, "email", "google@example.com", "email_verified", true),
                "sub");
        return new OAuth2AuthenticationToken(user, user.getAuthorities(), "google");
    }
}
