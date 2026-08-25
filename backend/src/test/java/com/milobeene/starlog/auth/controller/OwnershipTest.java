package com.milobeene.starlog.auth.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 남의 데이터에 접근할 수 없다 (NFR-S7).
 *
 * 인증(로그인 여부)과 인가(소유권)는 다른 층이다. 인증은 필터가, 소유권은 서비스가 본다.
 */
class OwnershipTest extends ControllerTestSupport {

    @Test
    public void 남의_항목_상세는_404다() throws Exception {
        //given
        Member owner = saveMember();
        Member stranger = saveMember();
        Long entryId = addEntry(owner, "Hollow Knight");

        //when //then — 403이면 "그 id는 존재한다"가 새어나간다
        mockMvc.perform(get("/api/backlog/{id}", entryId)
                        .header("X-Member-Id", stranger.getId()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    public void 남의_항목은_내_목록에_안_보인다() throws Exception {
        //given
        Member owner = saveMember();
        Member stranger = saveMember();
        addEntry(owner, "Celeste");

        //when //then
        mockMvc.perform(get("/api/backlog").header("X-Member-Id", stranger.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    private Long addEntry(Member member, String gameName) throws Exception {
        Game game = saveGame(gameName);
        String body = mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"gameId\":" + game.getId() + "}"))
                .andReturn().getResponse().getContentAsString();
        return Long.valueOf(body.replaceAll("\\D+", ""));
    }
}
