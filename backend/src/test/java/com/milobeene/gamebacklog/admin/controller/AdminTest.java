package com.milobeene.gamebacklog.admin.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.gamebacklog.admin.service.AuditLogService;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/** 관리자 (I-9) + 감사 로그 (I-10) */
class AdminTest extends ControllerTestSupport {

    /**
     * 감사 로그는 REQUIRES_NEW로 **별도 트랜잭션**에 쓴다. 테스트 트랜잭션이 아직 커밋하지 않은
     * 관리자 계정을 그 트랜잭션에서는 볼 수 없어 DB 검증이 성립하지 않는다.
     * 여기서 확인할 것은 "기록이 호출되는가"(배선)이므로 스파이로 본다.
     */
    @MockitoSpyBean AuditLogService auditLogService;

    @Test
    public void 일반_회원은_관리자_API에_접근할_수_없다() throws Exception {
        //given
        Member member = saveMember();

        //when //then
        mockMvc.perform(get("/api/admin/members").header("X-Member-Id", member.getId()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    public void 인증이_없으면_401이다() throws Exception {
        mockMvc.perform(get("/api/admin/members"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    public void 관리자는_회원_목록을_본다() throws Exception {
        //given
        Member admin = saveAdmin();
        saveMember();

        //when //then
        mockMvc.perform(get("/api/admin/members").header("X-Member-Id", admin.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items[0].email").exists());
    }

    @Test
    public void 회원_목록에_비밀번호는_실리지_않는다() throws Exception {
        //given
        Member admin = saveAdmin();

        //when
        String body = mockMvc.perform(get("/api/admin/members").header("X-Member-Id", admin.getId()))
                .andReturn().getResponse().getContentAsString();

        //then — 관리자에게도 해시를 보여줄 이유가 없다
        assertThat(body).doesNotContain("bcrypt").doesNotContain("password");
    }

    @Test
    public void 관리자는_마스터_게임명을_고치고_담긴_항목에_전파된다() throws Exception {
        //given
        Member admin = saveAdmin();
        Game game = saveGame("Holow Knight");

        //when //then
        mockMvc.perform(put("/api/admin/games/{id}/name", game.getId())
                        .header("X-Member-Id", admin.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Hollow Knight\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updatedEntries").isNumber());
    }

    @Test
    public void 관리자는_마스터_정보를_통째로_교체한다() throws Exception {
        //given
        Member admin = saveAdmin();
        Game game = saveGame("Hollow Knight");

        //when //then
        mockMvc.perform(put("/api/admin/games/{id}", game.getId())
                        .header("X-Member-Id", admin.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"developers":["Team Cherry"],"publishers":["Team Cherry"],
                                 "genres":["Metroidvania"],"releasedOn":"2017-02-24",
                                 "listPrice":{"amount":15500,"currency":"KRW"}}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updatedEntries").isNumber());
    }

    @Test
    public void 일반_회원은_마스터를_수정할_수_없다() throws Exception {
        //given — AUTH-P2: 등록 이후 수정은 관리자만
        Member member = saveMember();
        Game game = saveGame("Hollow Knight");

        //when //then
        mockMvc.perform(put("/api/admin/games/{id}/name", game.getId())
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"바꿔치기\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    public void 관리자는_감사_로그를_조회한다() throws Exception {
        //given
        Member admin = saveAdmin();

        //when //then
        mockMvc.perform(get("/api/admin/audit-logs").header("X-Member-Id", admin.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }

    @Test
    public void 감사_로그_조회도_감사_로그에_남는다() throws Exception {
        //given — AUTH-P1: "볼 수는 있되 본 기록이 남는다"
        Member admin = saveAdmin();

        //when
        mockMvc.perform(get("/api/admin/audit-logs").header("X-Member-Id", admin.getId()));

        //then
        verify(auditLogService).record(
                eq(admin.getId()), eq("GET /api/admin/audit-logs"), any(), any(), any(), any());
    }

    @Test
    public void 일반_회원은_감사_로그를_볼_수_없다() throws Exception {
        //given
        Member member = saveMember();

        //when //then
        mockMvc.perform(get("/api/admin/audit-logs").header("X-Member-Id", member.getId()))
                .andExpect(status().isForbidden());
    }

    @Test
    public void 관리자의_조회도_감사_로그에_남는다() throws Exception {
        //given — NFR-S8: 조회를 포함해 기록한다
        Member admin = saveAdmin();

        //when
        mockMvc.perform(get("/api/admin/members").header("X-Member-Id", admin.getId()))
                .andExpect(status().isOk());

        //then
        verify(auditLogService).record(
                eq(admin.getId()), eq("GET /api/admin/members"), any(), any(), any(), any());
    }

    @Test
    public void 일반_API는_감사_로그에_남지_않는다() throws Exception {
        //given — 전 경로에 걸면 감사 로그가 아니라 액세스 로그가 된다
        Member member = saveMember();

        //when
        mockMvc.perform(get("/api/me").header("X-Member-Id", member.getId()));

        //then
        verify(auditLogService, never()).record(any(), any(), any(), any(), any(), any());
    }

    @Test
    public void 거부된_접근도_감사_로그에_남는다() throws Exception {
        //given — "시도했지만 막혔다"가 오히려 중요한 기록이다
        Member member = saveMember();

        //when
        mockMvc.perform(get("/api/admin/members").header("X-Member-Id", member.getId()))
                .andExpect(status().isForbidden());

        //then
        verify(auditLogService).record(
                eq(member.getId()), eq("DENIED GET /api/admin/members"), any(), any(), any(), any());
    }

    private Member saveAdmin() {
        Member admin = saveMember();
        admin.promoteToAdmin();
        em.flush();
        em.clear();
        return admin;
    }
}
