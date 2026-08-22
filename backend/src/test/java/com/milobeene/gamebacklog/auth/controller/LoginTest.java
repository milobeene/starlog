package com.milobeene.gamebacklog.auth.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.service.MemberService;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import jakarta.servlet.http.Cookie;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import org.springframework.test.web.servlet.MvcResult;

/** 폼 로그인·세션 (I-3). 로그인은 컨트롤러가 아니라 필터가 처리한다 */
class LoginTest extends ControllerTestSupport {

    @Autowired MemberService memberService;
    @Autowired WebApplicationContext webApplicationContext;

    @Test
    public void 로그인에_성공하면_200과_세션을_준다() throws Exception {
        //given
        signUp("login@example.com", "password1234");

        //when
        MvcResult result = login("login@example.com", "password1234")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("login@example.com"))
                .andReturn();

        //then
        HttpSession session = result.getRequest().getSession(false);
        assertThat(session).isNotNull();
    }

    @Test
    public void 세션이_있으면_헤더_없이도_내_정보를_읽는다() throws Exception {
        //given
        signUp("session@example.com", "password1234");
        MockHttpSession session = (MockHttpSession) login("session@example.com", "password1234")
                .andReturn().getRequest().getSession(false);

        //when //then — X-Member-Id 헤더가 없다
        mockMvc.perform(get("/api/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.email").value("session@example.com"));
    }

    @Test
    public void 비밀번호가_틀리면_401이다() throws Exception {
        //given
        signUp("wrong@example.com", "password1234");

        //when //then
        login("wrong@example.com", "wrong-password")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_FAILED"));
    }

    @Test
    public void 없는_계정과_비밀번호_오류는_같은_응답이다() throws Exception {
        //given
        signUp("exists@example.com", "password1234");

        //when
        String wrongPassword = login("exists@example.com", "nope12345678")
                .andReturn().getResponse().getContentAsString();
        String noSuchAccount = login("nobody@example.com", "nope12345678")
                .andReturn().getResponse().getContentAsString();

        //then — 계정 존재 여부가 새면 가입자 목록을 열거할 수 있다 (NFR-S3)
        assertThat(wrongPassword).isEqualTo(noSuchAccount);
    }

    @Test
    public void 로그아웃하면_세션이_무효화된다() throws Exception {
        //given
        signUp("logout@example.com", "password1234");
        MockHttpSession session = (MockHttpSession) login("logout@example.com", "password1234")
                .andReturn().getRequest().getSession(false);

        //when
        mockMvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isNoContent());

        //then
        mockMvc.perform(get("/api/me").session(session))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void 인증이_없으면_401_JSON이다() throws Exception {
        //when //then — 302 리다이렉트가 아니어야 한다
        mockMvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    public void 브라우저처럼_요청해도_302가_아니라_401이다() throws Exception {
        mockMvc.perform(get("/api/me").accept(MediaType.TEXT_HTML))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void 가입과_로그인_경로는_인증_없이_열려있다() throws Exception {
        //when //then — 로그인 자체를 막으면 로그인할 방법이 없다
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"open@example.com","password":"password1234","nickname":"밀로"}"""))
                .andExpect(status().isCreated());
    }

    /** I-4 이후 미인증 계정은 로그인이 403이다. 로그인 테스트는 인증된 회원이 필요하다 */
    private void signUp(String email, String password) {
        memberService.signUp(email, password, "테스터");
        em.createQuery("select m from Member m where m.email = :email", Member.class)
                .setParameter("email", email)
                .getSingleResult()
                .verifyEmail();
        em.flush();
    }

    private org.springframework.test.web.servlet.ResultActions login(String email, String password)
            throws Exception {
        // 폼 로그인이라 JSON이 아니라 form 형식이다
        return mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("email", email)
                .param("password", password));
    }
}
