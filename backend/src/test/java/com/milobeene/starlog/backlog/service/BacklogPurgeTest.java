package com.milobeene.starlog.backlog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.LocalDateTime;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * 완전 삭제 (§7.4).
 *
 * **되돌릴 수 없는 경로라 테스트가 있어야 한다.** 특히 지키는 것 둘:
 *   1. 살아 있는 항목은 못 지운다 — 휴지통을 반드시 거친다
 *   2. 항목 ↔ 회차 순환 참조 때문에 삭제 순서가 틀리면 FK에 걸린다
 */
class BacklogPurgeTest extends ControllerTestSupport {

    @Autowired BacklogService backlogService;
    @Autowired PlaythroughService playthroughService;

    @Test
    public void 삭제된_항목은_완전히_지워진다() throws Exception {
        //given — 회차까지 딸린 항목이어야 순환 참조 경로를 실제로 밟는다
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());
        addPlaythrough(member, entryId);
        backlogService.delete(member.getId(), entryId);
        em.flush();
        em.clear();

        //when
        backlogService.purge(member.getId(), entryId);
        em.flush();
        em.clear();

        //then
        assertThat(em.find(BacklogEntry.class, entryId)).isNull();
        assertThat(count("Playthrough", entryId)).isZero();
        assertThat(count("Acquisition", entryId)).isZero();
        assertThat(count("BacklogEntryGenre", entryId)).isZero();
    }

    @Test
    public void 살아_있는_항목은_완전_삭제할_수_없다() {
        //given — 라이브러리의 게임이 한 방에 사라지는 경로를 만들지 않는다
        Member member = saveMember();
        Long entryId = backlogService.addToBacklog(member.getId(), saveGame("Hades").getId());
        em.flush();

        //when //then
        assertThatThrownBy(() -> backlogService.purge(member.getId(), entryId))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("삭제된 항목만");

        //then — 멀쩡히 남아 있다
        assertThat(em.find(BacklogEntry.class, entryId)).isNotNull();
    }

    @Test
    public void 남의_항목은_완전_삭제할_수_없다() {
        //given — 403이 아니라 404다. 403을 주면 "그 id는 존재한다"가 새어나간다 (NFR-S7)
        Member owner = saveMember();
        Member other = saveMember();
        Long entryId = backlogService.addToBacklog(owner.getId(), saveGame("Hollow Knight").getId());
        backlogService.delete(owner.getId(), entryId);
        em.flush();

        //when //then
        assertThatThrownBy(() -> backlogService.purge(other.getId(), entryId))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    public void 완전_삭제한_게임은_다시_담을_때_되살리기가_안_뜬다() throws Exception {
        //given — 소프트 삭제였다면 RevivableEntryException이 났을 자리다.
        //        완전히 지웠으니 그냥 새 항목으로 담겨야 한다
        Member member = saveMember();
        Game game = saveGame("Dead Cells");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.delete(member.getId(), entryId);
        em.flush();
        backlogService.purge(member.getId(), entryId);
        em.flush();
        em.clear();

        //when
        Long fresh = backlogService.addToBacklog(member.getId(), game.getId());

        //then
        assertThat(fresh).isNotEqualTo(entryId);
    }

    /** 자식이 남았는지만 본다 — 순서를 틀리면 여기가 아니라 FK 예외로 먼저 터진다 */
    private long count(String entityName, Long entryId) {
        return em.createQuery(
                        "select count(x) from " + entityName + " x where x.backlogEntry.id = :id",
                        Long.class)
                .setParameter("id", entryId)
                .getSingleResult();
    }

    private void addPlaythrough(Member member, Long entryId) throws Exception {
        mockMvc.perform(post("/api/backlog/{id}/playthroughs", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"startedOn\":\"2026-01-01\",\"status\":\"PLAYING\"}"))
                .andReturn();
        em.flush();
    }
}
