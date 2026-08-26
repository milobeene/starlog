package com.milobeene.starlog.common.quota;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.milobeene.starlog.common.exception.TooManyRequestsException;
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

    private int usedOf(Member member, QuotaKind kind) {
        return usageQuotaRepository.findUsed(member.getId(), LocalDate.now(), kind).orElse(0);
    }
}
