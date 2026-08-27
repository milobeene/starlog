package com.milobeene.starlog.member.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.CoverImage;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.service.MemberPurgeService;
import com.milobeene.starlog.member.service.WithdrawalService;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.LocalDateTime;

/** 탈퇴 유예 (I-7) + 유예 만료 물리 삭제 (I-8) */
class WithdrawalTest extends ControllerTestSupport {

    @Autowired MemberPurgeService memberPurgeService;
    @Autowired WithdrawalService withdrawalService;

    @Test
    public void 탈퇴를_요청하면_소프트_삭제된다() throws Exception {
        //given
        Member member = saveMember();

        //when
        mockMvc.perform(delete("/api/me").header("X-Member-Id", member.getId()))
                .andExpect(status().isNoContent());

        //then
        assertThat(reload(member).getDeletedAt()).isNotNull();
    }

    @Test
    public void 유예_중에도_복구는_할_수_있다() throws Exception {
        //given
        Member member = withdrawnMember();

        //when
        mockMvc.perform(post("/api/me/restore").header("X-Member-Id", member.getId()))
                .andExpect(status().isNoContent());

        //then
        assertThat(reload(member).getDeletedAt()).isNull();
    }

    @Test
    public void 복구하면_다시_일반_API가_열린다() throws Exception {
        //given
        Member member = withdrawnMember();
        mockMvc.perform(post("/api/me/restore").header("X-Member-Id", member.getId()));
        em.flush();
        em.clear();

        //when //then
        mockMvc.perform(get("/api/me").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk());
    }

    @Test
    public void 유예가_끝나면_회원과_데이터가_전부_사라진다() throws Exception {
        //given — 백로그 항목까지 딸린 회원
        Member member = saveMember();
        Game game = saveGame("Hollow Knight");
        mockMvc.perform(post("/api/backlog")
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"gameId\":" + game.getId() + "}"));
        member.withdraw(LocalDateTime.now().minusDays(31));
        em.flush();

        //when
        int purged = memberPurgeService.purgeExpired(LocalDateTime.now().minusDays(30)).purgedMembers();

        //then
        assertThat(purged).isEqualTo(1);
        assertThat(em.find(Member.class, member.getId())).isNull();
        assertThat(em.createQuery("select count(b) from BacklogEntry b where b.member.id = :id", Long.class)
                .setParameter("id", member.getId())
                .getSingleResult()).isZero();
    }

    @Test
    public void 유예_만료_퍼지는_커버_실물_파일까지_스토리지에서_지운다() throws Exception {
        //given — 커버가 붙은 항목을 가진 탈퇴 회원
        Member member = saveMember();
        Game game = saveGame("Hollow Knight");
        BacklogEntry entry = BacklogEntry.of(member, game);
        em.persist(entry);
        String storageKey = "covers/%d/%d/abc.jpg".formatted(member.getId(), entry.getId());
        em.persist(CoverImage.of(entry, storageKey, "image/jpeg", 100L));
        member.withdraw(LocalDateTime.now().minusDays(31));
        em.flush();

        /*
         * when — 스케줄러가 부르는 경로 **그대로**: 바깥 트랜잭션 없이.
         * purgeExpired는 Propagation.NEVER라 트랜잭션 안에서 부르면 거부한다 —
         * 그게 이 배치의 계약이다(커버 실물 삭제가 DB 커밋 뒤여야 하므로).
         * 테스트 트랜잭션을 커밋하고 닫아야 스케줄러와 같은 조건이 된다
         */
        Long memberId = member.getId();
        commitAndLeaveTransaction();

        withdrawalService.purgeExpired();

        //then — DB 행과 스토리지 실물이 함께 사라진다. 파일이 남으면 탈퇴가 탈퇴가 아니다
        assertThat(em.find(Member.class, memberId)).isNull();
        assertThat(storage.deleted).contains(storageKey);
    }

    @Test
    public void 유예가_안_끝난_회원은_남는다() throws Exception {
        //given
        Member member = saveMember();
        member.withdraw(LocalDateTime.now().minusDays(3));
        em.flush();

        //when
        int purged = memberPurgeService.purgeExpired(LocalDateTime.now().minusDays(30)).purgedMembers();

        //then
        assertThat(purged).isZero();
        assertThat(em.find(Member.class, member.getId())).isNotNull();
    }

    @Test
    public void 탈퇴하지_않은_회원은_배치가_건드리지_않는다() throws Exception {
        //given
        Member member = saveMember();
        em.flush();

        //when
        memberPurgeService.purgeExpired(LocalDateTime.now().minusDays(30));

        //then
        assertThat(em.find(Member.class, member.getId())).isNotNull();
    }

    private Member withdrawnMember() {
        Member member = saveMember();
        member.withdraw(LocalDateTime.now());
        em.flush();
        em.clear();
        return member;
    }

    private Member reload(Member member) {
        em.flush();
        em.clear();
        return em.find(Member.class, member.getId());
    }
}
