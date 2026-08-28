package com.milobeene.starlog.system.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.exception.TooManyRequestsException;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.support.ControllerTestSupport;
import com.milobeene.starlog.system.domain.ApiCallLog;
import com.milobeene.starlog.system.domain.ApiProvider;
import com.milobeene.starlog.system.repository.ApiCallLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;
import java.time.YearMonth;

/**
 * 번역 한도 방어선 (2026-08-28).
 *
 * ## 왜 이 테스트가 유난히 촘촘한가
 *
 * **여기만 틀리면 돈이 나간다.** IGDB도 스토리지도 한도를 넘으면 거절당하고 끝이지만,
 * 구글의 "월 50만 자 무료"는 *여기까지 청구 안 함*이지 *여기서 멈춤*이 아니다.
 * 한 자만 넘어도 초과분이 그대로 청구된다.
 *
 * 그래서 **경계값을 하나씩 못 박는다** — 정확히 한도일 때, 한 자 넘을 때, 한 자 모자랄 때.
 * "대충 막힌다"로는 부족하다.
 */
class TranslationQuotaTest extends ControllerTestSupport {

    @Autowired TranslationQuota quota;
    @Autowired ApiCallLogRepository apiCallLogRepository;

    /** 이번 달에 이미 쓴 것으로 치는 목 데이터 */
    private void 이번달에_썼다고_치자(long chars) {
        apiCallLogRepository.persist(ApiCallLog.of(
                ApiProvider.TRANSLATE, "translate", AppClock.now(), true, chars));
        em.flush();
        em.clear();
    }

    @Test
    public void 아무것도_안_썼으면_0이다() {
        //when //then
        assertThat(quota.usedThisMonth()).isZero();
        assertThat(quota.usage().remainingChars()).isEqualTo(TranslationQuota.GUARD_MONTHLY_CHARS);
    }

    @Test
    public void 쓴_만큼_더해진다() {
        //given
        이번달에_썼다고_치자(1_000);
        이번달에_썼다고_치자(2_500);

        //when //then — 합계다. 호출 수(2)가 아니라 글자 수(3,500)여야 한다
        assertThat(quota.usedThisMonth()).isEqualTo(3_500);
        assertThat(quota.usage().remainingChars())
                .isEqualTo(TranslationQuota.GUARD_MONTHLY_CHARS - 3_500);
    }

    /**
     * 🔴 **가장 중요한 경계.** 남은 양과 정확히 같은 요청은 통과해야 하고,
     * 한 자만 더해도 막혀야 한다. 여기가 밀리면 그 한 자가 청구된다
     */
    @Test
    public void 남은_양과_정확히_같으면_통과하고_한_자_더는_막힌다() {
        //given — 막는 선까지 1,000자 남겨둔다
        이번달에_썼다고_치자(TranslationQuota.GUARD_MONTHLY_CHARS - 1_000);

        //when //then
        assertThatCode(() -> quota.check(1_000))
                .as("정확히 남은 만큼은 보낼 수 있어야 한다")
                .doesNotThrowAnyException();

        assertThatThrownBy(() -> quota.check(1_001))
                .as("한 자만 넘어도 막아야 한다 — 그 한 자가 돈이다")
                .isInstanceOf(TooManyRequestsException.class);
    }

    @Test
    public void 한도를_이미_넘겼으면_아무것도_못_보낸다() {
        //given
        이번달에_썼다고_치자(TranslationQuota.GUARD_MONTHLY_CHARS);

        //when //then
        assertThatThrownBy(() -> quota.check(1))
                .isInstanceOf(TooManyRequestsException.class)
                .hasMessageContaining("번역 한도");
        assertThat(quota.usage().remainingChars()).isZero();
    }

    /**
     * 여러 번에 나눠 써도 **합계**로 막아야 한다.
     *
     * 한 번의 요청 크기만 보면 1,000자씩 500번을 보내 50만 자를 태울 수 있다
     */
    @Test
    public void 여러_번에_나눠_써도_합계로_막는다() {
        //given — 1,000자짜리를 449번. 막는 선까지 1,000자 남는다
        for (int i = 0; i < 449; i++) {
            apiCallLogRepository.persist(ApiCallLog.of(
                    ApiProvider.TRANSLATE, "translate", AppClock.now(), true, 1_000L));
        }
        em.flush();
        em.clear();

        //when //then
        assertThat(quota.usedThisMonth()).isEqualTo(449_000);
        assertThatCode(() -> quota.check(1_000)).doesNotThrowAnyException();
        assertThatThrownBy(() -> quota.check(1_500))
                .isInstanceOf(TooManyRequestsException.class);
    }

    /**
     * ⚠️ **실패한 호출도 센다.** 구글은 글자를 받아 처리한 뒤 실패했을 수 있고,
     * 그러면 우리만 안 세는 셈이 된다 — **적게 세는 쪽이 위험하다**
     */
    @Test
    public void 실패한_호출도_사용량에_센다() {
        //given
        apiCallLogRepository.persist(ApiCallLog.of(
                ApiProvider.TRANSLATE, "translate", AppClock.now(), false, 5_000L));
        em.flush();
        em.clear();

        //when //then
        assertThat(quota.usedThisMonth()).isEqualTo(5_000);
    }

    /**
     * ⚠️ **지난달 것은 안 센다.** 구글의 무료 한도가 달력 기준으로 리셋되므로,
     * "30일 전"처럼 굴러가는 창으로 세면 **월초에 새로 생긴 한도를 못 보고 계속 막는다**
     */
    @Test
    public void 지난달에_쓴_것은_안_센다() {
        //given — 달의 첫날 하루 전 = 지난달 마지막 날
        LocalDateTime 지난달 = YearMonth.from(AppClock.now()).atDay(1).atStartOfDay().minusDays(1);
        apiCallLogRepository.persist(ApiCallLog.of(
                ApiProvider.TRANSLATE, "translate", 지난달, true, 400_000L));
        이번달에_썼다고_치자(1_000);

        //when //then — 이번 달 것만
        assertThat(quota.usedThisMonth()).isEqualTo(1_000);
        assertThatCode(() -> quota.check(5_000)).doesNotThrowAnyException();
    }

    /** 다른 제공자(IGDB)의 기록이 번역 사용량에 섞이면 안 된다 */
    @Test
    public void 다른_API의_기록은_안_섞인다() {
        //given — IGDB는 units가 null이다 (셀 단위가 없다)
        apiCallLogRepository.persist(ApiCallLog.of(
                ApiProvider.IGDB, "games", AppClock.now(), true));
        apiCallLogRepository.persist(ApiCallLog.of(
                ApiProvider.STORAGE, "head", AppClock.now(), true));
        em.flush();
        em.clear();

        //when //then — null을 더해도 0이어야 한다 (coalesce가 없으면 여기서 터진다)
        assertThat(quota.usedThisMonth()).isZero();
    }

    /**
     * 한 번에 보낼 수 있는 양에도 상한이 있다.
     *
     * 어딘가 잘못돼서 책 한 권이 넘어오면 **한 번에 한 달치를 태운다**
     */
    @Test
    public void 한_번에_너무_많이_보내면_막는다() {
        //when //then
        assertThatThrownBy(() -> quota.check(TranslationQuota.MAX_CHARS_PER_CALL + 1))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("한 번에");

        assertThatCode(() -> quota.check(TranslationQuota.MAX_CHARS_PER_CALL))
                .doesNotThrowAnyException();
    }

    @Test
    public void 빈_요청은_막는다() {
        //when //then
        assertThatThrownBy(() -> quota.check(0)).isInstanceOf(InvalidInputException.class);
        assertThatThrownBy(() -> quota.check(-1)).isInstanceOf(InvalidInputException.class);
    }

    /** 기록한 만큼 다음 검사에 반영돼야 한다 — 이게 끊기면 한도가 영영 안 찬다 */
    @Test
    public void 기록하면_다음_검사에_반영된다() {
        //given
        quota.record(2_000, true);
        em.flush();
        em.clear();

        //when //then
        assertThat(quota.usedThisMonth()).isEqualTo(2_000);
    }
}
