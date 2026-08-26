package com.milobeene.starlog.common.quota;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.milobeene.starlog.common.exception.TooManyRequestsException;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;

/**
 * 일일 쿼터 (WEB-ONLY).
 *
 * 한도 자체(200/50/20)는 여기서 검증하지 않는다 — 설정값이라 바뀌는 게 정상이다.
 * 지키는 것은 **규칙**이다: 세는가, 넘으면 막는가, 첫 사용에 줄이 생기는가.
 */
class QuotaGuardTest extends ControllerTestSupport {

    @Autowired QuotaGuard quotaGuard;
    @Autowired UsageQuotaRepository usageQuotaRepository;
    @Autowired QuotaProperties quotaProperties;

    @Test
    public void 처음_쓰면_줄이_생기고_1이_된다() {
        //given
        Member member = saveMember();
        em.flush();

        //when
        quotaGuard.consume(member.getId(), QuotaKind.GAME_SEARCH);

        //then
        assertThat(usedOf(member, QuotaKind.GAME_SEARCH)).isEqualTo(1);
    }

    @Test
    public void 같은_날_다시_쓰면_누적된다() {
        //given
        Member member = saveMember();
        em.flush();

        //when
        quotaGuard.consume(member.getId(), QuotaKind.GAME_SEARCH);
        quotaGuard.consume(member.getId(), QuotaKind.GAME_SEARCH);
        quotaGuard.consume(member.getId(), QuotaKind.GAME_SEARCH);

        //then — 벌크 UPDATE가 영속성 컨텍스트를 우회하므로 여기서 옛 값을 보면 안 된다
        assertThat(usedOf(member, QuotaKind.GAME_SEARCH)).isEqualTo(3);
    }

    @Test
    public void 종류가_다르면_따로_센다() {
        //given
        Member member = saveMember();
        em.flush();

        //when
        quotaGuard.consume(member.getId(), QuotaKind.GAME_SEARCH);
        quotaGuard.consume(member.getId(), QuotaKind.GAME_ADD);

        //then
        assertThat(usedOf(member, QuotaKind.GAME_SEARCH)).isEqualTo(1);
        assertThat(usedOf(member, QuotaKind.GAME_ADD)).isEqualTo(1);
    }

    @Test
    public void 한도를_다_쓰면_429다() {
        //given — 한도까지 채운다
        Member member = saveMember();
        em.flush();
        int limit = quotaProperties.limitOf(QuotaKind.COVER_UPLOAD);
        for (int i = 0; i < limit; i++) {
            quotaGuard.consume(member.getId(), QuotaKind.COVER_UPLOAD);
        }

        //when //then
        assertThatThrownBy(() -> quotaGuard.consume(member.getId(), QuotaKind.COVER_UPLOAD))
                .isInstanceOf(TooManyRequestsException.class)
                .hasMessageContaining("자정");

        //then — 막힌 호출은 세지 않는다. 세면 한도가 계속 밀려난다
        assertThat(usedOf(member, QuotaKind.COVER_UPLOAD)).isEqualTo(limit);
    }

    @Test
    public void 회원이_다르면_서로의_쿼터를_안_먹는다() {
        //given
        Member first = saveMember();
        Member second = saveMember();
        em.flush();

        //when
        quotaGuard.consume(first.getId(), QuotaKind.GAME_SEARCH);

        //then
        assertThat(usedOf(second, QuotaKind.GAME_SEARCH)).isZero();
        assertThatCode(() -> quotaGuard.consume(second.getId(), QuotaKind.GAME_SEARCH))
                .doesNotThrowAnyException();
    }

    @Test
    public void 현황은_안_쓴_종류도_0으로_전부_보여준다() {
        //given — 화면이 "오늘 검색 0/200"을 그리려면 안 쓴 줄도 필요하다
        Member member = saveMember();
        em.flush();
        quotaGuard.consume(member.getId(), QuotaKind.GAME_SEARCH);

        //when
        var status = quotaGuard.statusOf(member.getId());

        //then
        assertThat(status).hasSize(QuotaKind.values().length);
        assertThat(status).allSatisfy(row -> assertThat(row.limit()).isPositive());
        assertThat(status).filteredOn(row -> row.kind() == QuotaKind.GAME_ADD)
                .singleElement()
                .satisfies(row -> assertThat(row.used()).isZero());
    }

    @Test
    public void 관리자는_한도가_없지만_횟수는_센다() {
        //given — 쿼터의 목적은 공용 IGDB 키를 한 사람이 다 쓰는 걸 막는 것이다.
        //        관리자는 재동기화·병합처럼 연달아 부르는 일을 해서 거기서 막히면 작업이 끊긴다
        Member admin = saveMember();
        admin.promoteToAdmin();
        em.flush();

        int limit = quotaProperties.limitOf(QuotaKind.COVER_UPLOAD);
        for (int i = 0; i < limit + 3; i++) {
            quotaGuard.consume(admin.getId(), QuotaKind.COVER_UPLOAD);
        }

        //then — 안 막힌다
        assertThat(usedOf(admin, QuotaKind.COVER_UPLOAD)).isEqualTo(limit + 3);

        //then — 그래도 세긴 센다. 안 세면 /admin에서 부하를 만든 사람만 안 보인다
        assertThat(quotaGuard.statusOf(admin.getId()))
                .filteredOn(row -> row.kind() == QuotaKind.COVER_UPLOAD)
                .singleElement()
                .satisfies(row -> {
                    assertThat(row.used()).isEqualTo(limit + 3);
                    assertThat(row.limit()).as("null이 무제한이다").isNull();
                });
    }

    @Test
    public void 하루_기준이_한국_시간이다() {
        //given — LocalDate.now()를 그냥 쓰면 JVM 타임존(Render는 UTC)을 따라
        //        한국 시간 오전 9시에 초기화된다. 화면 문구와 동작이 어긋난다
        Member member = saveMember();
        em.flush();
        quotaGuard.consume(member.getId(), QuotaKind.GAME_SEARCH);

        //when //then
        assertThat(usageQuotaRepository.findUsed(
                member.getId(), LocalDate.now(AppClock.ZONE), QuotaKind.GAME_SEARCH))
                .contains(1);
    }

    private int usedOf(Member member, QuotaKind kind) {
        return usageQuotaRepository.findUsed(member.getId(), AppClock.today(), kind).orElse(0);
    }
}
