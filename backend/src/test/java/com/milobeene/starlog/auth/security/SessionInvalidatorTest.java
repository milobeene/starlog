package com.milobeene.starlog.auth.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.session.SessionRegistry;

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
