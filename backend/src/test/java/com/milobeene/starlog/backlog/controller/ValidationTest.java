package com.milobeene.starlog.backlog.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/**
 * 입력 검증 두 겹 (H-6).
 *
 * 형태는 Bean Validation이 400으로 자르고, 도메인 규칙은 엔티티·서비스가 잡는다.
 * 둘 다 같은 ErrorResponse 형태로 나가는지가 이 테스트의 관심사다
 */
class ValidationTest extends ControllerTestSupport {

    @Autowired BacklogService backlogService;

    @Test
    public void 필수값이_없으면_400이고_어느_필드인지_알려준다() throws Exception {
        Member member = saveMember();

        mockMvc.perform(post("/api/backlog").header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("gameId")));
    }

    @Test
    public void 길이_제한을_넘으면_400이다() throws Exception {
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());

        //given — nameOverride 컬럼이 300자다
        String tooLong = "가".repeat(301);

        mockMvc.perform(put("/api/backlog/{id}/overrides", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + tooLong + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    public void 없는_enum_값을_보내도_우리_형식으로_400이_나간다() throws Exception {
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());

        //when //then — 스프링 기본 응답(timestamp/path)이 아니라 ErrorResponse여야 한다
        mockMvc.perform(post("/api/backlog/{id}/playthroughs", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"startedOn\":\"2026-01-01\",\"status\":\"BOGUS\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    public void 경로_변수의_타입이_안_맞으면_400이다() throws Exception {
        Member member = saveMember();

        mockMvc.perform(get("/api/backlog/{id}", "abc").header("X-Member-Id", member.getId()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    public void 도메인_규칙_위반도_같은_형식으로_400이다() throws Exception {
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());

        //when //then — 평점 범위는 DTO가 아니라 엔티티가 본다 (DTO 설계서 §7)
        mockMvc.perform(put("/api/backlog/{id}/personal-record", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\": 120.0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("평점")));
    }

    @Test
    public void 프로필_메모는_2000자까지_허용된다() throws Exception {
        //given — memo는 TEXT 컬럼. 100자 제한이던 시절의 회귀 방지
        Member member = saveMember();
        String longMemo = "가".repeat(2000);

        //when //then
        mockMvc.perform(put("/api/me/profile").header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"밀로\",\"memo\":\"" + longMemo + "\"}"))
                .andExpect(status().isOk());

        //초과하면 400 — 도메인 규칙이 아니라 폭주 방지 상한
        mockMvc.perform(put("/api/me/profile").header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"밀로\",\"memo\":\"" + longMemo + "가\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    /** dev 헤더가 숫자가 아니면 인증을 못 채운다 → 400이 아니라 401 (I-3) */
    public void 회원_헤더가_숫자가_아니면_401이다() throws Exception {
        mockMvc.perform(get("/api/backlog").header("X-Member-Id", "abc"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }


}
