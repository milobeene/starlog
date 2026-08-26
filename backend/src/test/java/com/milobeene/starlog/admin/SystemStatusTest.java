package com.milobeene.starlog.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.starlog.admin.dto.SystemStatusResponse;
import com.milobeene.starlog.admin.service.SystemStatusService;
import com.milobeene.starlog.common.quota.QuotaGuard;
import com.milobeene.starlog.common.quota.QuotaKind;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * WEB-ONLY: /admin 시스템 탭.
 *
 * **이 테스트의 진짜 이유는 DB 크기 조회다.** `pg_database_size()`는 PostgreSQL 전용이라
 * H2에서 반드시 실패하는데, 예전엔 그 실패가 트랜잭션을 rollback-only로 표시해
 * 커밋 때 UnexpectedRollbackException이 터졌다 — 화면 전체가 401로 죽었다.
 * 실패한 쿼리 하나가 응답 전체를 못 죽이는지를 여기서 지킨다
 */
class SystemStatusTest extends ControllerTestSupport {

    @Autowired SystemStatusService systemStatusService;
    @Autowired QuotaGuard quotaGuard;

    @Test
    public void DB_크기_조회가_실패해도_나머지가_전부_내려온다() {
        //given //when — H2라 pg_database_size는 반드시 실패한다
        SystemStatusResponse status = systemStatusService.status();

        //then
        assertThat(status).isNotNull();
        assertThat(status.database().sizeBytes()).as("H2에서는 못 구한다").isNull();
        assertThat(status.database().product()).isEqualTo("unknown");
        assertThat(status.storage()).isNotNull();
        assertThat(status.quotaToday()).isNotNull();
    }

    @Test
    public void 가짜_카탈로그가_붙어_있으면_IGDB_계측은_null이다() {
        //given — 테스트는 FakeGameCatalogClient를 쓴다. 캐스팅으로 죽으면 안 된다
        //when
        SystemStatusResponse status = systemStatusService.status();

        //then
        assertThat(status.igdb()).isNull();
    }

    @Test
    public void 오늘_쓴_쿼터가_회원_이름과_함께_나온다() {
        //given
        Member member = saveMember();
        em.flush();
        quotaGuard.consume(member.getId(), QuotaKind.GAME_SEARCH);

        //when
        SystemStatusResponse status = systemStatusService.status();

        //then
        assertThat(status.quotaToday())
                .filteredOn(row -> row.memberId().equals(member.getId()))
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.nickname()).isEqualTo(member.getNickname());
                    assertThat(row.used()).isEqualTo(1);
                    assertThat(row.limit()).isPositive();
                });
    }
}
