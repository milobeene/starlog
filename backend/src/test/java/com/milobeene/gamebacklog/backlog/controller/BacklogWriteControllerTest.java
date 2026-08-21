package com.milobeene.gamebacklog.backlog.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.gamebacklog.backlog.service.BacklogService;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/** 쓰기 엔드포인트 (H-3). 상태코드와 예외→응답 변환이 검증 대상이다 */
class BacklogWriteControllerTest extends ControllerTestSupport {

    @Autowired BacklogService backlogService;

    @Test
    public void 담기는_201과_Location과_id를_준다() throws Exception {
        //given
        Member member = saveMember();
        Game game = saveGame("Celeste");

        //when //then
        mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"gameId\": " + game.getId() + "}"))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").isNumber());
    }

    @Test
    public void 이미_담은_게임은_409다() throws Exception {
        //given
        Member member = saveMember();
        Game game = saveGame("Celeste");
        backlogService.addToBacklog(member.getId(), game.getId());

        //when //then
        mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"gameId\": " + game.getId() + "}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    public void 삭제된_항목을_다시_담으면_409에_되살리기_주소가_실린다() throws Exception {
        //given
        Member member = saveMember();
        Game game = saveGame("Celeste");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.delete(member.getId(), entryId);

        //when //then — 되살리기 안내는 ConflictException보다 구체적인 핸들러가 잡는다
        mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"gameId\": " + game.getId() + "}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("REVIVABLE"))
                .andExpect(jsonPath("$.targetId").value(entryId))
                .andExpect(jsonPath("$.reviveUrl").value("/api/backlog/" + entryId + "/revive"));
    }

    @Test
    public void 되살리면_다시_조회된다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());
        backlogService.delete(member.getId(), entryId);

        //when
        mockMvc.perform(post("/api/backlog/{entryId}/revive", entryId)
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());

        //then
        mockMvc.perform(get("/api/backlog/{entryId}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());
    }

    @Test
    public void 삭제는_204이고_그_뒤_조회는_404다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());

        //when //then
        mockMvc.perform(delete("/api/backlog/{entryId}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/backlog/{entryId}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(status().isNotFound());
    }

    @Test
    public void 오버라이드는_안_보낸_값을_지운다() throws Exception {
        //given
        Member member = saveMember();
        Game game = saveGame("Ring Fit Adventure");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        mockMvc.perform(put("/api/backlog/{entryId}/overrides", entryId)
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"링 피트\",\"listPrice\":{\"amount\":89800,\"currency\":\"KRW\"}}"));

        //when — 빈 요청 = 전체 교체이므로 오버라이드가 사라진다
        mockMvc.perform(put("/api/backlog/{entryId}/overrides", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        //then
        mockMvc.perform(get("/api/backlog/{entryId}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.resolved.name").value("Ring Fit Adventure"))
                .andExpect(jsonPath("$.overrides.name").doesNotExist())
                .andExpect(jsonPath("$.overrides.listPrice").doesNotExist());
    }

    @Test
    public void 회차를_추가하면_항목_상태가_파생된다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());

        //when
        mockMvc.perform(post("/api/backlog/{entryId}/playthroughs", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"startedOn":"2026-01-05","finishedOn":"2026-01-20",
                                 "status":"COMPLETED","inputMethod":"KEYBOARD_MOUSE"}"""))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", org.hamcrest.Matchers.startsWith("/api/playthroughs/")));

        //then — WISHLIST였던 항목이 회차를 따라 COMPLETED가 된다 (§7.6)
        mockMvc.perform(get("/api/backlog/{entryId}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.playthroughs[0].sequenceNo").value(1));
    }

    @Test
    public void 상태와_종료일이_모순이면_400이다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());

        //when //then — BR-PT-06. 엔티티 불변식이 InvalidInputException으로 올라온다
        mockMvc.perform(post("/api/backlog/{entryId}/playthroughs", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"startedOn":"2026-02-01","finishedOn":"2026-02-05","status":"PLAYING"}"""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    public void 태그를_전체_교체한다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());

        //when
        mockMvc.perform(put("/api/backlog/{entryId}/tags", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"names\":[\"명작\",\"고난이도\"]}"))
                .andExpect(status().isOk());

        //then
        mockMvc.perform(get("/api/backlog/{entryId}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.tags.length()").value(2));
    }

    @Test
    public void 게임_검색은_이름_부분_일치다() throws Exception {
        //given
        saveGame("Hollow Knight");
        saveGame("Celeste");

        //when //then
        mockMvc.perform(get("/api/games").param("q", "knight"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Hollow Knight"));
    }

    @Test
    public void 검색어가_비면_빈_목록이다() throws Exception {
        //given
        saveGame("Hollow Knight");

        //when //then — 전체를 퍼주지 않는다
        mockMvc.perform(get("/api/games").param("q", "   "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }


}
