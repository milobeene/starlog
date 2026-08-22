package com.milobeene.gamebacklog.auth.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.service.MemberService;
import jakarta.servlet.http.Cookie;
import org.springframework.mock.web.MockHttpServletResponse;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.annotation.DirtiesContext;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

/**
 * CSRF (OI-14, 로컬 기준).
 *
 * 다른 사이트의 페이지가 우리 API로 POST를 유도해도 세션 쿠키는 브라우저가 자동으로 붙인다.
 * 토큰은 쿠키에서 읽어 헤더로 되보내야 하므로 다른 출처에서는 만들 수 없다.
 *
 * 이 클래스만 CSRF 토큰을 기본으로 안 붙인 MockMvc를 따로 만든다.
 */
/*
 * 다른 테스트가 쓰는 .with(csrf()) 헬퍼는 **공유 컨텍스트의 CSRF 토큰 저장소를 바꿔버린다.**
 * 그러면 여기서 확인하려는 쿠키 왕복이 일어나지 않는다. 이 클래스만 새 컨텍스트에서 돌린다.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class CsrfTest extends ControllerTestSupport {

    @Autowired WebApplicationContext webApplicationContext;
    @Autowired MemberService memberService;

    @Test
    public void 토큰_없는_POST는_403이다() throws Exception {
        //given
        Member member = saveMember();
        var noCsrf = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .apply(springSecurity())
                .build();

        //when //then
        noCsrf.perform(post("/api/me/devices")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"deviceId\":1,\"label\":\"거실용\"}"))
                .andExpect(status().isForbidden());
    }

    /**
     * 로그인에 성공하면 시큐리티가 기존 CSRF 토큰을 폐기한다(세션 고정 방어의 일부).
     * 새 토큰을 응답에 안 실어주면 클라이언트는 토큰 없는 상태가 되어 이후 쓰기가 전부 403이 된다.
     * 실제로 겪은 버그라 브라우저와 같은 순서(쿠키 받기 → 헤더로 되보내기)로 확인한다.
     */
    @Test
    public void 로그인_응답은_새_CSRF_토큰_쿠키를_내려준다() throws Exception {
        //given
        memberService.signUp("csrf@example.com", "password1234", "테스터");
        em.createQuery("select m from Member m where m.email = 'csrf@example.com'", Member.class)
                .getSingleResult().verifyEmail();
        em.flush();
        var real = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .apply(springSecurity())
                .build();

        Cookie issued = real.perform(get("/api/me"))
                .andReturn().getResponse().getCookie("XSRF-TOKEN");
        org.assertj.core.api.Assertions.assertThat(issued)
                .as("인증 없는 요청에도 토큰 쿠키는 내려와야 한다").isNotNull();

        //when
        MockHttpServletResponse response = real.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .cookie(issued)
                        .header("X-XSRF-TOKEN", issued.getValue())
                        .param("email", "csrf@example.com")
                        .param("password", "password1234"))
                .andExpect(status().isOk())
                .andReturn().getResponse();

        //then — 응답에는 XSRF-TOKEN이 두 번 실린다. 앞의 것은 폐기용(빈 값), 뒤의 것이 새 토큰이다.
        // 브라우저는 나중 것으로 덮어쓴다
        Cookie refreshed = java.util.Arrays.stream(response.getCookies())
                .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                .reduce((first, second) -> second)
                .orElse(null);
        org.assertj.core.api.Assertions.assertThat(refreshed)
                .as("로그인 응답에 새 토큰이 실려야 한다").isNotNull();
        org.assertj.core.api.Assertions.assertThat(refreshed.getValue())
                .isNotBlank().isNotEqualTo(issued.getValue());
    }

    /**
     * 미인증 계정의 로그인은 403으로 거부되지만, 그 시점에 비밀번호 대조는 이미 통과했다.
     * 즉 CSRF 토큰이 회전된 뒤다 — 새 토큰을 안 내려주면 이후 요청이 전부 403이 된다.
     * (I-4에서 실제로 겪었다. 인증 API를 호출하지 못해 계정이 영영 인증을 못 받는 상태가 됐다)
     */
    @Test
    public void 미인증_로그인_거부_응답에도_새_CSRF_토큰이_실린다() throws Exception {
        //given — 인증하지 않은 회원
        memberService.signUp("unverified-csrf@example.com", "password1234", "테스터");
        em.flush();
        var real = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .apply(springSecurity())
                .build();
        Cookie issued = real.perform(get("/api/me"))
                .andReturn().getResponse().getCookie("XSRF-TOKEN");

        //when
        MockHttpServletResponse response = real.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .cookie(issued)
                        .header("X-XSRF-TOKEN", issued.getValue())
                        .param("email", "unverified-csrf@example.com")
                        .param("password", "password1234"))
                .andExpect(status().isForbidden())
                .andReturn().getResponse();

        //then
        Cookie refreshed = java.util.Arrays.stream(response.getCookies())
                .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                .reduce((first, second) -> second)
                .orElse(null);
        org.assertj.core.api.Assertions.assertThat(refreshed).isNotNull();
        org.assertj.core.api.Assertions.assertThat(refreshed.getValue())
                .isNotBlank().isNotEqualTo(issued.getValue());
    }

    @Test
    public void 조회는_토큰_없이도_된다() throws Exception {
        //given
        Member member = saveMember();
        var noCsrf = MockMvcBuilders.webAppContextSetup(webApplicationContext)
                .apply(springSecurity())
                .build();

        //when //then — GET은 상태를 바꾸지 않으므로 CSRF 대상이 아니다
        noCsrf.perform(get("/api/backlog").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());
    }
}
