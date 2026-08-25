package com.milobeene.starlog.admin.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** 게임 마스터 병합 (FR-ADM-02). 플랫폼·기기·에뮬 마스터는 V2에서 회원 소유로 내려가며 사라졌다 */
class MasterAdminTest extends ControllerTestSupport {

    @Test
    public void 병합하면_항목이_대상_게임으로_옮겨간다() throws Exception {
        //given — 같은 게임이 두 번 등록된 상황
        Member admin = saveAdmin();
        Game duplicate = saveGame("Holow Knight");
        Game canonical = saveGame("Hollow Knight");
        Long entryId = addEntry(saveMember(), duplicate);

        //when
        mockMvc.perform(post("/api/admin/games/{source}/merge-into/{target}",
                        duplicate.getId(), canonical.getId())
                        .header("X-Member-Id", admin.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movedEntries").value(1));

        //then
        BacklogEntry moved = em.find(BacklogEntry.class, entryId);
        assertThat(moved.getGame().getId()).isEqualTo(canonical.getId());
        assertThat(moved.getDisplayName()).isEqualTo("Hollow Knight");
        assertThat(em.find(Game.class, duplicate.getId())).isNull();
    }

    @Test
    public void 병합해도_개인_오버라이드는_살아남는다() throws Exception {
        //given — 회원이 이름을 직접 덮어쓴 항목
        Member admin = saveAdmin();
        Member member = saveMember();
        Game duplicate = saveGame("Holow Knight");
        Game canonical = saveGame("Hollow Knight");
        Long entryId = addEntry(member, duplicate);

        mockMvc.perform(put("/api/backlog/{id}/overrides", entryId)
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"할로우 나이트\"}"));
        em.flush();

        //when
        mockMvc.perform(post("/api/admin/games/{source}/merge-into/{target}",
                        duplicate.getId(), canonical.getId())
                .header("X-Member-Id", admin.getId()));

        //then — 마스터가 바뀌어도 내가 덮어쓴 이름은 그대로다
        em.clear();
        assertThat(em.find(BacklogEntry.class, entryId).getDisplayName()).isEqualTo("할로우 나이트");
    }

    @Test
    public void 양쪽을_다_담은_회원이_있으면_409다() throws Exception {
        //given — 그대로 옮기면 (member, game) 유니크 제약에 걸린다
        Member admin = saveAdmin();
        Member member = saveMember();
        Game duplicate = saveGame("Holow Knight");
        Game canonical = saveGame("Hollow Knight");
        addEntry(member, duplicate);
        addEntry(member, canonical);

        //when //then
        mockMvc.perform(post("/api/admin/games/{source}/merge-into/{target}",
                        duplicate.getId(), canonical.getId())
                        .header("X-Member-Id", admin.getId()))
                .andExpect(status().isConflict());
    }

    @Test
    public void 같은_게임끼리는_병합할_수_없다() throws Exception {
        //given
        Member admin = saveAdmin();
        Game game = saveGame("Hollow Knight");

        //when //then
        mockMvc.perform(post("/api/admin/games/{source}/merge-into/{target}",
                        game.getId(), game.getId())
                        .header("X-Member-Id", admin.getId()))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 일반_회원은_병합할_수_없다() throws Exception {
        //given
        Member member = saveMember();
        Game a = saveGame("A");
        Game b = saveGame("B");

        //when //then
        mockMvc.perform(post("/api/admin/games/{source}/merge-into/{target}", a.getId(), b.getId())
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isForbidden());
    }

    private Member saveAdmin() {
        Member admin = saveMember();
        admin.promoteToAdmin();
        em.flush();
        em.clear();
        return admin;
    }

    private Long addEntry(Member member, Game game) throws Exception {
        String body = mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"gameId\":" + game.getId() + "}"))
                .andReturn().getResponse().getContentAsString();
        return Long.valueOf(body.replaceAll("\\D+", ""));
    }
}
