package com.milobeene.starlog.auth.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.session.Session;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;

/**
 * 전 세션 무효화 (FR-AUTH-05 재설정, FR-AUTH-09 탈퇴).
 *
 * **O-4에서 이 테스트가 통째로 뒤집혔다.** 예전에는 `SessionRegistry`에 세션을 직접 등록해두고
 * 무효화 로직만 봤다. 세션이 DB로 간 지금 `SpringSessionBackedSessionRegistry`의
 * `registerNewSession`은 **빈 구현**이라 그 방식은 아무것도 안 한다 — 등록한 줄 알고 0건을 세게 된다.
 *
 * 그래서 세션을 **저장소에 실제로 만들어** 넣는다. 이러면 principal 이름 색인까지 진짜 경로를 탄다.
 */
class SessionInvalidatorTest extends ControllerTestSupport {

    private static final String EXPIRED_ATTR_SUFFIX = "%EXPIRED";

    @Autowired SessionRegistry sessionRegistry;
    @Autowired SessionInvalidator sessionInvalidator;
    @Autowired JdbcIndexedSessionRepository sessionRepository;
    @Autowired JdbcTemplate jdbc;

    @Test
    public void 한_회원의_모든_세션이_끊긴다() throws Exception {
        //given — 같은 회원이 두 기기에서 로그인한 상황
        Member member = saveMember();
        String phone = givenSessionOf(member);
        String laptop = givenSessionOf(member);

        //when
        int expired = sessionInvalidator.expireAllSessionsOf(member.getId());

        //then
        assertThat(expired).isEqualTo(2);
        assertThat(isExpired(phone)).isTrue();
        assertThat(isExpired(laptop)).isTrue();
    }

    @Test
    public void 다른_회원의_세션은_건드리지_않는다() throws Exception {
        //given
        Member mine = saveMember();
        Member other = saveMember();
        givenSessionOf(mine);
        String otherSession = givenSessionOf(other);

        //when
        sessionInvalidator.expireAllSessionsOf(mine.getId());

        //then
        assertThat(isExpired(otherSession)).isFalse();
    }

    @Test
    public void 로그인한_적_없는_회원은_0건이다() throws Exception {
        //given
        Member member = saveMember();

        //when //then
        assertThat(sessionInvalidator.expireAllSessionsOf(member.getId())).isZero();
    }

    /**
     * **회귀 방지.** 한때 `getAllSessions(...).stream().peek(expireNow).count()`로 짰다가
     * 세션이 하나도 안 끊긴 채 "n건 끊었다"만 나온 적이 있다 — 자바 9부터 `count()`는 크기를
     * 이미 아는 스트림이면 파이프라인을 실행하지 않아 `peek`이 통째로 건너뛰어진다.
     * 반환값과 **DB에 남은 흔적**을 함께 단언해야 그 부류가 잡힌다
     */
    @Test
    public void 반환값이_아니라_실제로_끊겼는지를_본다() throws Exception {
        //given
        Member member = saveMember();
        String sessionId = givenSessionOf(member);

        //when
        int reported = sessionInvalidator.expireAllSessionsOf(member.getId());

        //then
        assertThat(reported).isEqualTo(1);
        assertThat(expiredMarkCountOf(sessionId))
                .as("만료 표시가 DB에 실제로 적혀야 한다")
                .isEqualTo(1);
    }

    /**
     * 로그인이 남기는 것과 같은 세션을 만든다.
     *
     * `SPRING_SECURITY_CONTEXT`를 넣는 게 핵심 — Spring Session은 저장 시점에 이 속성에서
     * `Authentication#getName()`을 뽑아 `principal_name` 컬럼에 색인한다.
     * 우리 `MemberPrincipal.getUsername()`이 이메일이라 그 값이 곧 색인 키다
     */
    private String givenSessionOf(Member member) {
        // 저장소의 세션 구현(JdbcSession)은 package-private이라 이름을 못 쓴다 →
        // var로 받아 그대로 넘기고, 값을 읽고 쓸 때만 Session 인터페이스로 올려다본다
        var jdbcSession = sessionRepository.createSession();
        Session session = jdbcSession;

        MemberPrincipal principal = MemberPrincipal.from(member);
        SecurityContext context = new SecurityContextImpl(
                UsernamePasswordAuthenticationToken.authenticated(
                        principal, null, principal.getAuthorities()));
        session.setAttribute("SPRING_SECURITY_CONTEXT", context);

        sessionRepository.save(jdbcSession);
        return session.getId();
    }

    private boolean isExpired(String sessionId) {
        return sessionRegistry.getSessionInformation(sessionId).isExpired();
    }

    private Integer expiredMarkCountOf(String sessionId) {
        return jdbc.queryForObject(
                "select count(*) from spring_session_attributes a"
                        + " join spring_session s on a.session_primary_id = s.primary_id"
                        + " where s.session_id = ? and a.attribute_name like ?",
                Integer.class, sessionId, EXPIRED_ATTR_SUFFIX);
    }
}
