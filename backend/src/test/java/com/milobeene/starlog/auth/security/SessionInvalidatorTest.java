package com.milobeene.starlog.auth.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.Map;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;

/**
 * 전 세션 무효화 (FR-AUTH-05).
 *
 * MockMvc는 서블릿 컨테이너를 안 띄워서 세션 생성 이벤트가 발생하지 않는다 →
 * `SessionRegistry`가 자동으로 채워지지 않는다. 그래서 레지스트리에 직접 등록해두고
 * **무효화 로직만** 검증한다. 실제 등록까지 포함한 확인은 I-3T(종단 테스트)의 몫이다.
 */
class SessionInvalidatorTest extends ControllerTestSupport {

    @Autowired SessionRegistry sessionRegistry;
    @Autowired SessionInvalidator sessionInvalidator;

    /**
     * SessionRegistry는 스프링 컨텍스트를 공유하는 **싱글턴**이라 등록한 세션이 테스트 사이에 샌다.
     * 남으면 다른 테스트의 "몇 건 끊겼나" 단언이 흔들린다 — 실제로 그렇게 깨진 적이 있다
     */
    @AfterEach
    void clearRegistry() {
        sessionRegistry.getAllPrincipals().forEach(principal ->
                sessionRegistry.getAllSessions(principal, true)
                        .forEach(session -> sessionRegistry.removeSessionInformation(session.getSessionId())));
    }

    @Test
    public void 한_회원의_모든_세션이_끊긴다() throws Exception {
        //given — 같은 회원이 두 기기에서 로그인한 상황
        Member member = saveMember();
        MemberPrincipal principal = MemberPrincipal.from(member);
        sessionRegistry.registerNewSession("session-phone", principal);
        sessionRegistry.registerNewSession("session-laptop", principal);

        //when
        int expired = sessionInvalidator.expireAllSessionsOf(member.getId());

        //then
        assertThat(expired).isEqualTo(2);
        assertThat(sessionRegistry.getSessionInformation("session-phone").isExpired()).isTrue();
        assertThat(sessionRegistry.getSessionInformation("session-laptop").isExpired()).isTrue();
    }

    @Test
    public void 다른_회원의_세션은_건드리지_않는다() throws Exception {
        //given
        Member mine = saveMember();
        Member other = saveMember();
        sessionRegistry.registerNewSession("mine", MemberPrincipal.from(mine));
        sessionRegistry.registerNewSession("other", MemberPrincipal.from(other));

        //when
        sessionInvalidator.expireAllSessionsOf(mine.getId());

        //then
        assertThat(sessionRegistry.getSessionInformation("other").isExpired()).isFalse();
    }

    /**
     * 구글 로그인 세션이 **여기서 통째로 새고 있었다.**
     *
     * 시큐리티 필터는 성공 핸들러를 부르기 전에 세션을 레지스트리에 등록하는데, 그때 principal은
     * 구글이 준 OAuth2 사용자(DefaultOidcUser)다. 핸들러가 SecurityContext만 MemberPrincipal로
     * 갈아끼우면 레지스트리에는 OAuth2 principal이 남아 `instanceof MemberPrincipal` 필터에
     * 안 걸린다 — 탈퇴·비밀번호 재설정의 전 세션 무효화가 조용히 0건이 된다.
     * v1.9는 구글 로그인 전용이라 사실상 모든 세션이 해당됐다.
     *
     * 그래서 GoogleOAuth2SuccessHandler가 레지스트리를 갈아끼운다. 이 테스트는 그 필요성과
     * 효과를 한 쌍으로 못박는다
     */
    @Test
    public void 구글_principal로_등록된_세션은_재등록해야_끊긴다() throws Exception {
        //given — 시큐리티 필터가 등록한 그대로
        Member member = saveMember();
        sessionRegistry.registerNewSession("google-session", oidcUser());

        //when //then — 갈아끼우기 전에는 0건이다
        assertThat(sessionInvalidator.expireAllSessionsOf(member.getId())).isZero();

        //when — 핸들러의 reregisterSession이 하는 일 그대로
        sessionRegistry.removeSessionInformation("google-session");
        sessionRegistry.registerNewSession("google-session", MemberPrincipal.from(member));

        //then
        assertThat(sessionInvalidator.expireAllSessionsOf(member.getId())).isEqualTo(1);
        assertThat(sessionRegistry.getSessionInformation("google-session").isExpired()).isTrue();
    }

    private DefaultOidcUser oidcUser() {
        return new DefaultOidcUser(null, OidcIdToken.withTokenValue("token")
                .claim("sub", "google-sub-" + System.nanoTime())
                .claims(claims -> claims.putAll(Map.of("iss", "https://accounts.google.com")))
                .build());
    }

    /**
     * MemberPrincipal에 equals가 없으면 로그인마다 다른 키가 되어 "이 회원의 세션"을 못 찾는다.
     * 조용히 0개를 끊고 성공한 척하게 되는 종류의 버그라 못을 박아둔다.
     */
    @Test
    public void principal은_회원_id로_같은_것으로_취급된다() throws Exception {
        //given
        Member member = saveMember();

        //when
        MemberPrincipal first = MemberPrincipal.from(member);
        MemberPrincipal second = MemberPrincipal.from(member);

        //then
        assertThat(first).isEqualTo(second);
        assertThat(first.hashCode()).isEqualTo(second.hashCode());
    }
}
