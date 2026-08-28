package com.milobeene.starlog.system.service;

import com.milobeene.starlog.common.exception.TooManyRequestsException;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.system.domain.ApiProvider;
import com.milobeene.starlog.system.repository.ApiCallLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * 번역이 **돈이 되기 전에 막는다** (2026-08-28).
 *
 * ## 왜 이것만 특별한가
 *
 * IGDB도 스토리지도 한도를 넘으면 그냥 거절당한다 — 아프지만 공짜다.
 * **구글의 무료 한도는 다르다.** "월 50만 자 무료"는 *여기까지 청구하지 않겠다*는 뜻이지
 * *여기서 멈추겠다*는 뜻이 아니다. 한 자라도 넘으면 초과분이 그대로 청구된다.
 * 예산 알림도 알려주기만 하고 아무것도 막지 않는다.
 *
 * ## 두 겹으로 막는다
 *
 * <pre>
 *   1) 구글의 할당량   하루 10,000자   ← 진짜 방어선. 넘으면 403, 청구 없음
 *   2) 이 클래스        월 45만 자      ← 그 앞에서 미리 거절
 * </pre>
 *
 * 1번이 최후 방어선인 이유는 **이 클래스가 완벽할 수 없기 때문**이다:
 * 세이브파일마다 제 기록을 따로 세므로, 여러 기록을 오가며 쓰면 **합계가 구글이 아는 것보다
 * 적게 나온다.** 그래서 여기 숫자는 "편의"고 지갑을 지키는 건 구글 쪽 할당량이다.
 * 그 사실을 화면에도 적어야 한다.
 *
 * ## 5만 자를 남겨둔다
 *
 * 50만이 아니라 45만에서 막는 이유 —
 * <ul>
 *   <li>구글의 한 달과 우리의 한 달이 시간대 때문에 정확히 안 맞는다</li>
 *   <li>실패한 호출도 구글은 셀 수 있는데 우리가 못 셌을 수 있다</li>
 *   <li>다른 기록(세이브파일)에서 쓴 몫이 여기 안 잡힌다</li>
 * </ul>
 * 셋 다 **우리가 적게 세는 방향**의 오차다. 여유가 그쪽으로 있어야 한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TranslationQuota {

    /** 구글이 매달 공짜로 주는 양. 화면이 "쓴 양 / 이 값"으로 보여준다 */
    public static final long FREE_MONTHLY_CHARS = 500_000;

    /** 우리가 실제로 막는 선. 위 주석의 세 가지 오차만큼 남겨둔다 */
    public static final long GUARD_MONTHLY_CHARS = 450_000;

    /**
     * 한 번에 보낼 수 있는 최대 글자 수.
     *
     * 소개문 하나가 보통 1,000자 안쪽인데, 어딘가 잘못돼서 **책 한 권이 통째로** 넘어오면
     * 한 번에 한 달치를 태운다. 상한이 있어야 그 사고가 한 번으로 끝난다
     */
    public static final int MAX_CHARS_PER_CALL = 5_000;

    private final ApiCallLogRepository repository;

    /** 이번 달에 쓴 글자 수 */
    public long usedThisMonth() {
        return repository.sumUnitsSince(ApiProvider.TRANSLATE, startOfMonth());
    }

    /** 화면이 그대로 그린다 — 쓴 양·막는 선·공짜 한도가 한 벌로 가야 뜻이 통한다 */
    public Usage usage() {
        long used = usedThisMonth();
        return new Usage(used, GUARD_MONTHLY_CHARS, FREE_MONTHLY_CHARS,
                Math.max(0, GUARD_MONTHLY_CHARS - used));
    }

    public record Usage(long usedChars, long guardChars, long freeChars, long remainingChars) {}

    /**
     * 보내도 되는지 묻는다. **호출 전에 부른다** — 다녀와서 확인하면 이미 늦었다.
     *
     * @param chars 이번에 보낼 글자 수
     * @throws TooManyRequestsException 막는 선을 넘을 때. 502가 아니라 429인 이유는
     *                                  외부가 고장 난 게 아니라 **우리가 스스로 막은 것**이라서다
     */
    public void check(int chars) {
        if (chars <= 0) {
            throw new com.milobeene.starlog.common.exception.InvalidInputException(
                    "번역할 내용이 없습니다");
        }
        if (chars > MAX_CHARS_PER_CALL) {
            throw new com.milobeene.starlog.common.exception.InvalidInputException(
                    "한 번에 %,d자까지 번역할 수 있습니다 (요청 %,d자)"
                            .formatted(MAX_CHARS_PER_CALL, chars));
        }

        long used = usedThisMonth();
        /*
         * ⚠️ **더한 값으로 비교한다.** `used > 한도`로 보면 한도 직전에 큰 요청이 통과해서
         * 넘어간다 — 그 순간이 정확히 돈이 나가는 순간이다
         */
        if (used + chars > GUARD_MONTHLY_CHARS) {
            log.warn("번역 한도에 걸려 거절했습니다. 이번 달 {}자 사용, 요청 {}자", used, chars);
            throw new TooManyRequestsException("TRANSLATE_QUOTA_EXCEEDED",
                    "이번 달 번역 한도(%,d자)에 도달했습니다. 지금까지 %,d자를 쓰셨습니다. 다음 달에 다시 쓰실 수 있습니다."
                            .formatted(GUARD_MONTHLY_CHARS, used));
        }
    }

    /**
     * 쓴 만큼 기록한다. **호출 직후에 부른다.**
     *
     * `ApiCallRecorder`와 달리 실패를 안 삼킨다 — 이 줄이 안 남으면 다음 검사가
     * **덜 쓴 것으로 착각해서** 한도를 넘긴다. 계측이 아니라 방어의 일부다.
     *
     * ⚠️ **`REQUIRES_NEW`인 이유가 그것이다.** 부르는 쪽 트랜잭션에 얹으면 그쪽이 롤백될 때
     * 이 줄도 함께 사라진다. 그런데 **구글은 이미 글자를 받아 세었다** — 기록만 사라지면
     * 우리가 실제보다 적게 알게 되고, 그 차이만큼 한도를 넘겨 돈이 나간다
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public void record(int chars, boolean success) {
        repository.persist(com.milobeene.starlog.system.domain.ApiCallLog.of(
                ApiProvider.TRANSLATE, "translate", AppClock.now(), success, (long) chars));
    }

    /**
     * 구글이 한도를 리셋하는 시간대.
     *
     * ⚠️ **우리 시간대로 세면 안 된다.** 구글의 할당량은 태평양 시간 자정에 리셋되는데
     * 한국은 그보다 16~17시간 **앞선다.** 우리 기준으로 9월 1일 0시는 태평양으로는 아직
     * 8월 31일 오전이다 — 그 사이에 **우리는 새 달이라 세다가 구글은 지난달로 세는**
     * 구간이 생긴다. 8월이 한도에 가까웠다면 그때 쓴 만큼이 그대로 초과 청구다.
     *
     * 태평양으로 맞추면 구글이 UTC를 쓰더라도 안전하다 — 태평양 월초가 UTC 월초보다
     * **뒤**라서 우리가 늦게 리셋하는 쪽, 즉 덜 쓰는 쪽으로 틀리기 때문이다
     */
    private static final ZoneId QUOTA_ZONE = ZoneId.of("America/Los_Angeles");

    /**
     * 이번 달의 시작 — **태평양 기준을 우리 시각으로 옮긴 값**이다.
     *
     * "30일 전"이 아니라 달의 첫날인 이유 — 구글의 무료 한도가 **달력 기준**으로 리셋되므로,
     * 굴러가는 30일 창으로 세면 월초에 한도가 새로 생긴 것을 못 보고 계속 막는다.
     *
     * `calledAt`이 시스템 시각으로 저장되므로 비교 기준도 같은 시각계로 되돌린다
     */
    private LocalDateTime startOfMonth() {
        ZonedDateTime nowThere = AppClock.now().atZone(ZoneId.systemDefault())
                .withZoneSameInstant(QUOTA_ZONE);
        return YearMonth.from(nowThere).atDay(1).atStartOfDay(QUOTA_ZONE)
                .withZoneSameInstant(ZoneId.systemDefault())
                .toLocalDateTime();
    }
}
