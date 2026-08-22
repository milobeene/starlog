package com.milobeene.gamebacklog.admin.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.gamebacklog.admin.domain.AuditLog;
import com.milobeene.gamebacklog.admin.service.AuditLogService;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;

/** 감사 로그 보존 기간 (OI-08 — 1년). 정리 배치는 스케줄러를 거치지 않고 직접 부른다 */
class AuditLogRetentionTest extends ControllerTestSupport {

    @Autowired AuditLogService auditLogService;

    @Test
    public void 보존_기간이_1년이다() throws Exception {
        assertThat(AuditLogService.RETENTION.toDays()).isEqualTo(365);
    }

    @Test
    public void 오래된_로그는_정리된다() throws Exception {
        //given — createdAt은 @CreatedDate가 채우므로 직접 못 넣는다. 기준 시각을 미래로 잡아 대신한다
        Member actor = saveMember();
        em.persist(AuditLog.of(actor, "GET /api/admin/members", "HTTP", null, "127.0.0.1", "test"));
        em.flush();

        //when
        int deleted = auditLogService.purge(LocalDateTime.now().plusDays(1));

        //then
        assertThat(deleted).isEqualTo(1);
    }

    @Test
    public void 보존_기간_안의_로그는_남는다() throws Exception {
        //given
        Member actor = saveMember();
        em.persist(AuditLog.of(actor, "GET /api/admin/members", "HTTP", null, "127.0.0.1", "test"));
        em.flush();

        //when
        int deleted = auditLogService.purge(LocalDateTime.now().minusDays(365));

        //then
        assertThat(deleted).isZero();
    }
}
