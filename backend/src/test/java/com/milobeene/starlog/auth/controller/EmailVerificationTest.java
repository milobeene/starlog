package com.milobeene.starlog.auth.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.auth.domain.AuthToken;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.CapturingAuthMailSender;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.RequestBuilder;

import java.time.LocalDateTime;

/**
 * 이메일 인증 (I-4).
 *
 * 토큰 원문은 DB에 없다(해시만 저장). 그래서 테스트도 **발송 포트를 가로채서** 원문을 얻는다 —
 * 실제 사용자가 메일로 받는 것과 같은 경로다.
 */
/*
 * 인증 메일은 **커밋 뒤에** 나간다 (AfterCommit) — 롤백되는 테스트 트랜잭션에서는
 * 영영 실행되지 않으므로, 발송을 단언하는 테스트는 commitNow()로 한 번 끊어준다.
 * 커밋된 데이터가 남으므로 조회 단언에는 자기 계정 조건을 붙인다
 */
@Import(CapturingAuthMailSender.class)
class EmailVerificationTest extends ControllerTestSupport {

    @Autowired CapturingAuthMailSender mailSender;

    @BeforeEach
    void clearMailbox() {
        mailSender.sent.clear();
    }

    @Test
    public void 가입하면_인증_메일이_나간다() throws Exception {
        //when
        mockMvc.perform(signUp("verify@example.com")).andExpect(status().isCreated());
        commitNow();

        //then
        assertThat(mailSender.sent).hasSize(1);
        assertThat(mailSender.sent.getFirst().email()).isEqualTo("verify@example.com");
        assertThat(mailSender.sent.getFirst().token()).isNotBlank();
    }

    @Test
    public void 토큰_원문은_저장되지_않는다() throws Exception {
        //given
        mockMvc.perform(signUp("nostore@example.com"));
        commitNow();
        String rawToken = mailSender.sent.getFirst().token();

        //when — 커밋된 다른 테스트의 토큰이 섞이므로 이 계정으로 좁힌다
        AuthToken saved = em.createQuery(
                        "select t from AuthToken t where t.member.email = :email", AuthToken.class)
                .setParameter("email", "nostore@example.com")
                .getResultList().getFirst();

        //then
        assertThat(saved.getTokenHash()).isNotEqualTo(rawToken);
        assertThat(saved.getUsedAt()).isNull();
        assertThat(saved.getExpiresAt()).isAfter(LocalDateTime.now());
    }

    @Test
    public void 토큰으로_인증하면_로그인할_수_있다() throws Exception {
        //given
        mockMvc.perform(signUp("ok@example.com"));
        commitNow();
        String rawToken = mailSender.sent.getFirst().token();

        //when
        mockMvc.perform(verify(rawToken)).andExpect(status().isNoContent());

        //then
        assertThat(findMember("ok@example.com").isEmailVerified()).isTrue();
    }

    @Test
    public void 인증_전에는_로그인이_403이다() throws Exception {
        //given
        mockMvc.perform(signUp("unverified@example.com"));

        //when //then — 비밀번호는 맞지만 인증이 안 됐다
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("email", "unverified@example.com")
                        .param("password", "password1234"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("EMAIL_NOT_VERIFIED"));
    }

    @Test
    public void 같은_토큰을_두_번_쓸_수_없다() throws Exception {
        //given
        mockMvc.perform(signUp("once@example.com"));
        commitNow();
        String rawToken = mailSender.sent.getFirst().token();
        mockMvc.perform(verify(rawToken)).andExpect(status().isNoContent());

        //when //then
        mockMvc.perform(verify(rawToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    public void 없는_토큰이면_400이다() throws Exception {
        mockMvc.perform(verify("완전히-지어낸-토큰"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 재발송은_60초_안에_두_번_나가지_않는다() throws Exception {
        //given
        mockMvc.perform(signUp("throttle@example.com"));
        commitNow();

        //when
        mockMvc.perform(resend("throttle@example.com")).andExpect(status().isAccepted());
        commitNow();

        //then — 가입 때 1통. 스로틀에 걸려 추가 발송이 없다 (NFR-S9)
        assertThat(mailSender.sent).hasSize(1);
    }

    @Test
    public void 없는_계정에_재발송해도_같은_응답이다() throws Exception {
        //when //then — 202. 가입 여부가 새면 이메일 목록을 열거할 수 있다 (NFR-S3)
        mockMvc.perform(resend("nobody@example.com")).andExpect(status().isAccepted());
        assertThat(mailSender.sent).isEmpty();
    }

    @Test
    public void 이미_인증된_계정에_재발송해도_메일이_안_나간다() throws Exception {
        //given
        mockMvc.perform(signUp("done@example.com"));
        commitNow();
        mockMvc.perform(verify(mailSender.sent.getFirst().token()));
        commitNow();
        mailSender.sent.clear();

        //when //then
        mockMvc.perform(resend("done@example.com")).andExpect(status().isAccepted());
        commitNow();
        assertThat(mailSender.sent).isEmpty();
    }

    private Member findMember(String email) {
        em.flush();
        em.clear();
        return em.createQuery("select m from Member m where m.email = :email", Member.class)
                .setParameter("email", email)
                .getSingleResult();
    }

    private static RequestBuilder signUp(String email) {
        return post("/api/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"password1234","nickname":"테스터"}""".formatted(email));
    }

    private static RequestBuilder verify(String token) {
        return post("/api/auth/email-verification")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\"}");
    }

    private static RequestBuilder resend(String email) {
        return post("/api/auth/email-verification/resend")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\"}");
    }

}
