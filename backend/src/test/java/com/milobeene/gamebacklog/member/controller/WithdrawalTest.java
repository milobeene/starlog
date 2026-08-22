package com.milobeene.gamebacklog.member.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.service.MemberPurgeService;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.LocalDateTime;

/** 탈퇴 유예 (I-7) + 유예 만료 물리 삭제 (I-8) */
class WithdrawalTest extends ControllerTestSupport {

    @Autowired MemberPurgeService memberPurgeService;

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
    public void 유예_중에는_일반_API가_막힌다() throws Exception {
        //given — 인증은 통과하되 인가만 제한된다 (FR-AUTH-10)
        Member member = withdrawnMember();

        //when //then
        mockMvc.perform(get("/api/me").header("X-Member-Id", member.getId()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    public void 유예_중_로그인_응답이_복구_필요를_알려준다() throws Exception {
        //given — 인증은 성공한다. 프론트가 복구 화면으로 보내야 하므로 상태를 알려줘야 한다
        Member member = saveMember();
        member.verifyEmail();
        member.withdraw(LocalDateTime.now());
        em.flush();
        em.clear();

        //when //then
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("email", member.getEmail())
                        .param("password", "1111"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.withdrawalPending").value(true));
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
    public void 유예_상태가_아니면_복구할_수_없다() throws Exception {
        //given
        Member member = saveMember();

        //when //then — ROLE_USER라 복구 경로 자체가 막힌다
        mockMvc.perform(post("/api/me/restore").header("X-Member-Id", member.getId()))
                .andExpect(status().isForbidden());
    }

    @Test
    public void 탈퇴한_이메일은_유예_중_재사용할_수_없다() throws Exception {
        //given — BR-AUTH-02
        Member member = withdrawnMember();

        //when //then
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"password1234","nickname":"다른사람"}"""
                                .formatted(member.getEmail())))
                .andExpect(status().isConflict());
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
        int purged = memberPurgeService.purgeExpired(LocalDateTime.now().minusDays(30));

        //then
        assertThat(purged).isEqualTo(1);
        assertThat(em.find(Member.class, member.getId())).isNull();
        assertThat(em.createQuery("select count(b) from BacklogEntry b where b.member.id = :id", Long.class)
                .setParameter("id", member.getId())
                .getSingleResult()).isZero();
    }

    @Test
    public void 유예가_안_끝난_회원은_남는다() throws Exception {
        //given
        Member member = saveMember();
        member.withdraw(LocalDateTime.now().minusDays(3));
        em.flush();

        //when
        int purged = memberPurgeService.purgeExpired(LocalDateTime.now().minusDays(30));

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
