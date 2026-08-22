package com.milobeene.gamebacklog.auth.service;

import com.milobeene.gamebacklog.auth.repository.AuthTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * 만료·사용 완료 토큰 정리 (I-12, FR-SYS-06 계열).
 *
 * @Scheduled는 **프록시 기반이 아니라 별도 스레드**에서 돈다. 요청 스레드가 아니므로
 * 요청 스코프 빈이나 SecurityContext를 기대하면 안 된다.
 * 스케줄 자체는 프로퍼티로 뺐다 — 테스트에서 꺼야 하고, 배포마다 주기를 바꿀 수 있어야 한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthTokenCleaner {

    /** 만료 후에도 잠시 남겨둔다. "링크가 왜 안 되지"를 조사할 여지 */
    private static final Duration GRACE = Duration.ofDays(7);

    private final AuthTokenRepository authTokenRepository;

    @Scheduled(cron = "${app.cleanup.auth-token-cron}")
    public void cleanUp() {
        int deleted = purge(LocalDateTime.now().minus(GRACE));
        if (deleted > 0) {
            log.info("만료 토큰 {}건 정리", deleted);
        }
    }

    /** 스케줄러를 거치지 않고 직접 부를 수 있게 분리 — 테스트가 시간을 통제한다 */
    @Transactional
    public int purge(LocalDateTime threshold) {
        return authTokenRepository.deleteSettled(threshold);
    }
}
