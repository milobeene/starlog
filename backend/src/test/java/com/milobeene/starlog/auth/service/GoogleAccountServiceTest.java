package com.milobeene.starlog.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.CapturingAuthMailSender;
import com.milobeene.starlog.support.CapturingAuthMailSender.Kind;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * 구글 연동 (I-6).
 *
 * OAuth2 왕복(리다이렉트·토큰 교환)은 시큐리티 필터의 몫이라 여기서는 검증하지 않는다.
 * 검증하는 것은 **우리가 정한 규칙** — 자동 가입 금지, 중복 연결 금지, 해제 조건이다.
 * 실제 왕복은 구글 자격증명을 넣은 뒤 수동으로 확인해야 한다.
 */
@Import(CapturingAuthMailSender.class)
class GoogleAccountServiceTest extends ControllerTestSupport {

    @Autowired GoogleAccountService googleAccountService;
    @Autowired PasswordResetService passwordResetService;
    @Autowired CapturingAuthMailSender mailSender;

    @Test
    public void 로그인한_회원에게_구글_계정을_연결한다() throws Exception {
        //given
        Member member = saveMember();

        //when
        googleAccountService.link(member.getId(), "google-sub-1");

        //then
        em.flush();
        em.clear();
        assertThat(em.find(Member.class, member.getId()).getGoogleSubject()).isEqualTo("google-sub-1");
    }

    @Test
    public void 구글로_가입하면_비밀번호가_없는_계정이_생긴다() throws Exception {
        //when
        Member member = googleAccountService.signUp(
                "new-sub-1", "gsignup@example.com", true, "밀로");

        //then
        assertThat(member.getPassword()).isNull();
        assertThat(member.getEmail()).isEqualTo("gsignup@example.com");
        assertThat(member.getNickname()).isEqualTo("밀로");
        assertThat(member.isEmailVerified()).as("구글이 확인해준 이메일은 재확인하지 않는다").isTrue();
    }

    @Test
    public void 이미_가입된_이메일이면_이어붙이지_않고_거부한다() throws Exception {
        //given — 자동 연결을 허용하면 선점 가입으로 계정을 탈취당한다 (§6.1)
        Member existing = saveMember();

        //when //then
        assertThatThrownBy(() -> googleAccountService.signUp(
                "new-sub-2", existing.getEmail(), true, "누군가"))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 탈퇴_유예_중인_이메일로도_가입할_수_없다() throws Exception {
        //given — BR-AUTH-02
        Member withdrawn = saveMember();
        withdrawn.withdraw(java.time.LocalDateTime.now());
        em.flush();

        //when //then
        assertThatThrownBy(() -> googleAccountService.signUp(
                "new-sub-3", withdrawn.getEmail(), true, "누군가"))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 구글이_이메일을_확인해주지_않았으면_우리_인증_메일이_나간다() throws Exception {
        //given
        mailSender.sent.clear();

        //when
        Member member = googleAccountService.signUp(
                "new-sub-4", "unverified-google@example.com", false, "밀로");

        //then
        assertThat(member.isEmailVerified()).isFalse();
        commitNow();   // 인증 메일은 커밋 뒤에 나간다 (AfterCommit)
        assertThat(mailSender.of(Kind.EMAIL_VERIFICATION)).hasSize(1);
    }

    @Test
    public void 구글_이름이_없으면_이메일_앞부분을_닉네임으로_쓴다() throws Exception {
        //when
        Member member = googleAccountService.signUp("new-sub-5", "noname@example.com", true, null);

        //then — 닉네임은 not null이라 비워둘 수 없다
        assertThat(member.getNickname()).isEqualTo("noname");
    }

    @Test
    public void 소셜_전용_계정은_재설정_경로로도_비밀번호를_만들_수_없다() throws Exception {
        /*
         * 뒤집힌 규칙이다 (OI-02 후속). 예전엔 "구글 계정을 잃었을 때 영영 못 들어온다"는 이유로
         * 이 경로를 열어뒀는데, 지금은 **재설정 메일 자체가 배달되지 않는다** —
         * 그래서 열어둬도 실제 복구는 안 되고, 비밀번호 설정 차단만 우회하는 구멍이 된다.
         *
         * 대가: 구글 계정을 잃으면 이 서비스 계정도 잃는다. 메일 발송이 가능해지면 되돌린다
         */
        mailSender.sent.clear();
        Member member = googleAccountService.signUp("new-sub-6", "social-pw@example.com", true, "밀로");
        em.flush();

        passwordResetService.request("social-pw@example.com");
        commitNow();   // 재설정 메일도 커밋 뒤에 나간다
        String token = mailSender.of(Kind.PASSWORD_RESET).getFirst().token();

        //when //then
        assertThatThrownBy(() -> passwordResetService.reset(token, "brandNewPassword1"))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("Google 로그인 전용");

        em.clear();
        assertThat(em.find(Member.class, member.getId()).getPassword()).isNull();
    }

    @Test
    public void 같은_구글_계정을_두_회원에게_연결할_수_없다() throws Exception {
        //given
        Member first = saveMember();
        Member second = saveMember();
        googleAccountService.link(first.getId(), "google-sub-2");
        em.flush();

        //when //then
        assertThatThrownBy(() -> googleAccountService.link(second.getId(), "google-sub-2"))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 같은_회원에게_다시_연결하는_것은_허용된다() throws Exception {
        //given
        Member member = saveMember();
        googleAccountService.link(member.getId(), "google-sub-3");
        em.flush();

        //when //then — 멱등. 다시 눌러도 실패하면 사용자가 당황한다
        googleAccountService.link(member.getId(), "google-sub-3");
    }

    @Test
    public void 비밀번호가_있어도_연결을_해제할_수_없다() {
        //given — 예전엔 비밀번호만 있으면 해제됐다 (BR-AUTH-01). 지금은 통째로 닫혀 있다:
        // 이메일 가입과 비밀번호 설정을 막아둔 상태(인증 메일 발송 불가)에서 해제까지 열어두면
        // 다시 연결할 방법이 없어 되돌리기 어렵다. 정리는 탈퇴로 한다 (FR-AUTH-09/10)
        Member member = saveMember();
        googleAccountService.link(member.getId(), "google-sub-4");
        em.flush();

        //when //then
        assertThatThrownBy(() -> googleAccountService.unlink(member.getId()))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("탈퇴");
    }

    @Test
    public void 비밀번호가_없으면_해제할_수_없다() throws Exception {
        //given — 소셜 전용 계정. 해제하면 로그인 수단이 하나도 안 남는다 (BR-AUTH-01)
        //        지금은 비밀번호 유무와 무관하게 막히지만, 이 경우가 원래 규칙의 핵심이었다
        Member member = Member.signUpWithEmail("social" + System.nanoTime() + "@example.com", null, "소셜");
        em.persist(member);
        googleAccountService.link(member.getId(), "google-sub-5");
        em.flush();

        //when //then
        assertThatThrownBy(() -> googleAccountService.unlink(member.getId()))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 연결이_없으면_해제할_수_없다() throws Exception {
        //given
        Member member = saveMember();

        //when //then
        assertThatThrownBy(() -> googleAccountService.unlink(member.getId()))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 해제_API는_인증이_필요하다() throws Exception {
        mockMvc.perform(delete("/api/me/google"))
                .andExpect(status().isUnauthorized());
    }
}
