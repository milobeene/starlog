package com.milobeene.starlog.auth.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.auth.domain.AuthToken;
import com.milobeene.starlog.auth.domain.TokenPurpose;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.service.MemberService;
import com.milobeene.starlog.support.CapturingAuthMailSender;
import com.milobeene.starlog.support.CapturingAuthMailSender.Kind;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.RequestBuilder;

import java.time.LocalDateTime;

/** 비밀번호 재설정 (I-5) */
@Import(CapturingAuthMailSender.class)
class PasswordResetTest extends ControllerTestSupport {

    @Autowired CapturingAuthMailSender mailSender;
    @Autowired MemberService memberService;
    @Autowired PasswordEncoder passwordEncoder;

    @BeforeEach
    void clearMailbox() {
        mailSender.sent.clear();
    }

    @Test
    public void 요청하면_재설정_메일이_나간다() throws Exception {
        //given
        signUp("reset@example.com");

        //when
        mockMvc.perform(request("reset@example.com")).andExpect(status().isAccepted());

        //then
        assertThat(mailSender.of(Kind.PASSWORD_RESET)).hasSize(1);
    }

    @Test
    public void 재설정_토큰의_유효시간은_인증_토큰보다_짧다() throws Exception {
        //given — 계정을 통째로 넘겨주는 열쇠라 노출 창을 좁힌다
        signUp("short@example.com");
        mockMvc.perform(request("short@example.com"));
        em.flush();

        //when
        AuthToken token = em.createQuery(
                        "select t from AuthToken t where t.purpose = :purpose", AuthToken.class)
                .setParameter("purpose", TokenPurpose.PASSWORD_RESET)
                .getSingleResult();

        //then — 30분
        assertThat(token.getExpiresAt()).isBefore(LocalDateTime.now().plusHours(1));
    }

    @Test
    public void 재설정하면_새_비밀번호로_바뀐다() throws Exception {
        //given
        signUp("change@example.com");
        mockMvc.perform(request("change@example.com"));
        String rawToken = mailSender.of(Kind.PASSWORD_RESET).getFirst().token();

        //when
        mockMvc.perform(confirm(rawToken, "brandNewPassword1")).andExpect(status().isNoContent());

        //then
        Member member = findMember("change@example.com");
        assertThat(passwordEncoder.matches("brandNewPassword1", member.getPassword())).isTrue();
        assertThat(passwordEncoder.matches("password1234", member.getPassword())).isFalse();
    }

    @Test
    public void 같은_토큰을_두_번_쓸_수_없다() throws Exception {
        //given
        signUp("twice@example.com");
        mockMvc.perform(request("twice@example.com"));
        String rawToken = mailSender.of(Kind.PASSWORD_RESET).getFirst().token();
        mockMvc.perform(confirm(rawToken, "brandNewPassword1")).andExpect(status().isNoContent());

        //when //then
        mockMvc.perform(confirm(rawToken, "anotherPassword12"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    public void 재설정하면_남아있던_다른_링크도_죽는다() throws Exception {
        //given — 두 번 요청해서 링크가 둘인 상황 (스로틀 때문에 서비스로 직접 만든다)
        Member member = signUp("multi@example.com");
        mockMvc.perform(request("multi@example.com"));
        String firstToken = mailSender.of(Kind.PASSWORD_RESET).getFirst().token();
        em.flush();

        // 두 번째 토큰을 직접 심는다
        em.persist(new AuthToken(member, TokenPurpose.PASSWORD_RESET,
                com.milobeene.starlog.auth.service.TokenValuesTestAccess.hash("second-token"),
                LocalDateTime.now().plusMinutes(30)));
        em.flush();

        //when — 첫 번째 링크로 재설정
        mockMvc.perform(confirm(firstToken, "brandNewPassword1")).andExpect(status().isNoContent());

        //then — 두 번째 링크도 못 쓴다
        mockMvc.perform(confirm("second-token", "yetAnotherPass12"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 비밀번호_규칙은_가입과_같다() throws Exception {
        //given
        signUp("weak@example.com");
        mockMvc.perform(request("weak@example.com"));
        String rawToken = mailSender.of(Kind.PASSWORD_RESET).getFirst().token();

        //when //then — 여기만 느슨하면 재설정이 우회로가 된다
        mockMvc.perform(confirm(rawToken, "123"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 없는_계정에_요청해도_같은_응답이다() throws Exception {
        //when //then
        mockMvc.perform(request("nobody@example.com")).andExpect(status().isAccepted());
        assertThat(mailSender.of(Kind.PASSWORD_RESET)).isEmpty();
    }

    @Test
    public void 없는_토큰으로_재설정하면_400이다() throws Exception {
        mockMvc.perform(confirm("지어낸-토큰", "brandNewPassword1"))
                .andExpect(status().isBadRequest());
    }

    private Member signUp(String email) {
        Long id = memberService.signUp(email, "password1234", "테스터");
        Member member = em.find(Member.class, id);
        member.verifyEmail();
        em.flush();
        return member;
    }

    private Member findMember(String email) {
        em.flush();
        em.clear();
        return em.createQuery("select m from Member m where m.email = :email", Member.class)
                .setParameter("email", email)
                .getSingleResult();
    }

    private static RequestBuilder request(String email) {
        return post("/api/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\"}");
    }

    private static RequestBuilder confirm(String token, String newPassword) {
        return post("/api/auth/password-reset")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"%s\",\"newPassword\":\"%s\"}".formatted(token, newPassword));
    }
}
