package com.milobeene.starlog.game.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.springframework.beans.factory.annotation.Autowired;
import org.junit.jupiter.api.Test;

/**
 * 마스터 게임 — 목록과 삭제 (v1.0 8단계).
 *
 * **병합 테스트가 여기 없다.** 병합은 폐기됐다 —
 * `GameMergeService`가 "같은 회원이 둘 다 담고 있으면 409"였는데,
 * 1인 앱에서 중복이 생기는 전형적인 경로가 바로 그 상황이라
 * **가장 흔한 경우에 항상 거부되는 기능**이 됐다 (architecture §9).
 */
class GameMasterTest extends ControllerTestSupport {

    @Autowired BacklogService backlogService;

    @Test
    public void 마스터_목록은_IGDB를_안_섞는다() throws Exception {
        //given
        Member member = saveMember();
        saveGame("Hollow Knight");

        //when //then — 담기 화면(`/api/games`)과 달리 페이지네이션이 붙는다
        mockMvc.perform(get("/api/games/master").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].gameId").exists())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    public void 마스터를_지우면_담긴_기록도_함께_사라진다() throws Exception {
        /*
         * given — 마스터를 지우는 건 "이 게임 자체를 없앤다"는 뜻이다.
         * 항목만 휴지통에 남기면 되살릴 마스터가 없어 앞뒤가 안 맞는다 (§10-3)
         */
        Member member = saveMember();
        Game game = saveGame("Hollow Knight");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        //when
        mockMvc.perform(delete("/api/games/{gameId}", game.getId())
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deletedEntries").value(1));

        //then — 휴지통이 아니라 완전히 없다
        em.clear();
        assertThat(em.find(Game.class, game.getId())).isNull();
        assertThat(em.find(BacklogEntry.class, entryId)).isNull();
    }

    @Test
    public void 아무도_안_담은_마스터도_지워진다() throws Exception {
        //given — 참조가 0건인 경우. 삭제 쿼리들이 빈 결과에도 안전해야 한다
        Member member = saveMember();
        Game game = saveGame("Nobody Played This");

        //when //then
        mockMvc.perform(delete("/api/games/{gameId}", game.getId())
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deletedEntries").value(0));

        em.clear();
        assertThat(em.find(Game.class, game.getId())).isNull();
    }

    @Test
    public void 없는_마스터를_지우면_404() throws Exception {
        Member member = saveMember();

        mockMvc.perform(delete("/api/games/{gameId}", 999_999L)
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isNotFound());
    }
}
