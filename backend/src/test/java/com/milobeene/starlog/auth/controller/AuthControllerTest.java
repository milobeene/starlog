package com.milobeene.starlog.auth.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;

/** 가입 (I-2). 로그인은 I-3에서 붙는다 */
class AuthControllerTest extends ControllerTestSupport {

    @Autowired PasswordEncoder passwordEncoder;

    @Test
    public void 가입하면_201과_회원_id를_준다() throws Exception {
        //when //then
        mockMvc.perform(signUp("new@example.com", "password1234", "밀로"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber());
    }

    @Test
    public void 비밀번호는_원문으로_저장되지_않는다() throws Exception {
        //given
        mockMvc.perform(signUp("hash@example.com", "password1234", "밀로"));

        //when
        Member saved = em.createQuery("select m from Member m where m.email = :email", Member.class)
                .setParameter("email", "hash@example.com")
                .getSingleResult();

        //then
        assertThat(saved.getPassword()).isNotEqualTo("password1234");
        assertThat(saved.getPassword()).startsWith("{bcrypt}");
        assertThat(passwordEncoder.matches("password1234", saved.getPassword())).isTrue();
    }

    @Test
    public void 가입_직후에는_이메일_미인증_상태다() throws Exception {
        //given
        mockMvc.perform(signUp("unverified@example.com", "password1234", "밀로"));

        //when
        Member saved = em.createQuery("select m from Member m where m.email = :email", Member.class)
                .setParameter("email", "unverified@example.com")
                .getSingleResult();

        //then
        assertThat(saved.isEmailVerified()).isFalse();
    }

    @Test
    public void 이미_가입된_이메일이면_409() throws Exception {
        //given
        mockMvc.perform(signUp("dup@example.com", "password1234", "밀로"));

        //when //then
        mockMvc.perform(signUp("dup@example.com", "password1234", "다른사람"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    public void 대소문자만_다른_이메일도_중복이다() throws Exception {
        //given
        mockMvc.perform(signUp("case@example.com", "password1234", "밀로"));

        //when //then
        mockMvc.perform(signUp("Case@Example.com", "password1234", "밀로"))
                .andExpect(status().isConflict());
    }

    @Test
    public void 이메일_형식이_아니면_400() throws Exception {
        mockMvc.perform(signUp("not-an-email", "password1234", "밀로"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    public void 비밀번호가_4자_미만이면_400() throws Exception {
        mockMvc.perform(signUp("short@example.com", "123", "밀로"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 닉네임이_공백뿐이면_400() throws Exception {
        mockMvc.perform(signUp("blank@example.com", "password1234", "   "))
                .andExpect(status().isBadRequest());
    }

    private static org.springframework.test.web.servlet.RequestBuilder signUp(
            String email, String password, String nickname) {
        return post("/api/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"%s","nickname":"%s"}"""
                        .formatted(email, password, nickname));
    }
}
