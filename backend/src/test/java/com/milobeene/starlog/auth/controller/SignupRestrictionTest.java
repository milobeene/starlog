package com.milobeene.starlog.auth.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.admin.service.MemberApprovalService;
import com.milobeene.starlog.auth.service.AuthService;
import com.milobeene.starlog.auth.service.GoogleAccountService;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.service.MemberService;
import jakarta.persistence.EntityManager;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이메일 가입 차단 (OI-02 후속).
 *
 * **인증 메일을 보낼 수단이 없어서 막았다.** Resend는 도메인 인증 전까지 계정 소유자에게만
 * 보내주고, 유일한 우회로였던 SMTP는 Render 무료 플랜이 2025-09부터 아웃바운드를 막았다.
 * 메일이 안 가면 미인증으로 남아 로그인이 영영 403이라(I-4) 가입시키는 게 더 나쁘다.
 *
 * 다른 테스트는 무작위 이메일로 회원을 만들어야 해서 application-test.yml이 제한을 비워둔다.
 * 그래서 **제한이 켜진 상태의 동작은 이 파일만 검증한다** —
 * 프로퍼티를 여기서 직접 주입해 운영과 같은 조건을 만든다
 */
@SpringBootTest(properties = {
        "app.signup.email-allowlist=allowed@example.com",
        "app.signup.require-approval=true"
})
@ActiveProfiles("test")
@Transactional
class SignupRestrictionTest {

    @Autowired AuthService authService;
    @Autowired GoogleAccountService googleAccountService;
    @Autowired MemberApprovalService memberApprovalService;
    @Autowired MemberService memberService;
    @Autowired EntityManager em;

    @Test
    public void 허용_목록_밖의_이메일은_가입이_거부된다() {
        //when //then — 400. 화면은 이 문구를 그대로 보여준다
        assertThatThrownBy(() -> authService.signUp("stranger@example.com", "1111", "낯선이"))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("Google");
    }

    @Test
    public void 대소문자가_달라도_허용_목록으로_인정된다() {
        //given — 이메일은 소문자로 수렴한다. 목록 쪽도 같은 규칙으로 맞춰야 한다
        //when
        Long memberId = authService.signUp("ALLOWED@Example.com", "1111", "주인");

        //then
        assertThat(em.find(Member.class, memberId).getEmail()).isEqualTo("allowed@example.com");
    }

    @Test
    public void 구글_가입은_제한을_받지_않는다() {
        //given — 구글이 이메일 소유를 확인해주므로 우리가 메일을 보낼 이유가 없다.
        // 이 제한의 목적은 "인증 못 받는 계정을 만들지 않는 것"이지 가입을 막는 게 아니다
        //when
        Member member = em.find(Member.class,
                signUpWithGoogle("google-user@example.com", "google-sub-1"));

        //then
        assertThat(member.getGoogleSubject()).isEqualTo("google-sub-1");
        assertThat(member.isEmailVerified()).isTrue();
    }

    @Test
    public void 구글_전용_계정은_비밀번호를_설정할_수_없다() {
        //given — 비밀번호가 생기면 이메일 로그인 계정이 되는데, 그 경로는 인증 메일이 필요하다
        Long memberId = signUpWithGoogle("google-pw@example.com", "google-sub-2");

        //when //then
        assertThatThrownBy(() -> memberService.changePassword(memberId, null, "1111"))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("Google 로그인 전용");
    }

    @Test
    public void 구글_연결은_해제할_수_없다() {
        //given — 해제를 허용하면 로그인 수단이 하나도 안 남는 계정이 생긴다.
        // 정리는 탈퇴로 한다 — 30일 유예가 있어 되돌릴 수 있다 (FR-AUTH-09/10)
        Member member = em.find(Member.class, signUpWithGoogle("google-unlink@example.com", "sub-3"));

        //when //then
        assertThatThrownBy(member::unlinkGoogle)
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("탈퇴");
    }

    // ── 가입 승인제 (FR-ADM-06)

    @Test
    public void 가입_직후에는_승인_대기_상태다() {
        //given — 무료 티어 용량을 지키려고 관리자가 승인해야 로그인이 된다
        Long memberId = authService.signUp("allowed@example.com", "1111", "주인");

        //then
        assertThat(em.find(Member.class, memberId).isApproved()).isFalse();
    }

    @Test
    public void 승인하면_승인_시각이_남고_두_번_승인해도_안_바뀐다() {
        //given — 승인 시각을 덮어쓰면 "언제 들어온 사람인가"라는 감사 기록이 사라진다
        Long memberId = authService.signUp("allowed@example.com", "1111", "주인");
        memberApprovalService.approve(memberId);
        em.flush();

        LocalDateTime first = em.find(Member.class, memberId).getApprovedAt();
        assertThat(first).isNotNull();

        //when //then — 이미 승인된 회원은 409
        assertThatThrownBy(() -> memberApprovalService.approve(memberId))
                .isInstanceOf(ConflictException.class);
        assertThat(em.find(Member.class, memberId).getApprovedAt()).isEqualTo(first);
    }

    @Test
    public void 구글로_가입해도_승인_대기다() {
        //given — 구글 로그인은 폼 로그인과 다른 경로다.
        // 여길 빼먹으면 승인제가 통째로 우회된다 (GoogleOAuth2SuccessHandler)
        Member member = googleAccountService.signUp(
                "google-approval-sub", "google-approval@example.com", true, "구글유저");
        em.flush();

        //then
        assertThat(member.isApproved()).isFalse();
    }

    private Long signUpWithGoogle(String email, String googleSubject) {
        Member member = Member.signUpWithGoogle(email, "구글유저", googleSubject, true);
        em.persist(member);
        em.flush();
        return member.getId();
    }
}
