package com.milobeene.starlog.common.config;

import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.system.repository.ApiCallLogRepository;
import com.milobeene.starlog.system.service.SystemStatusService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 뜰 때 밀린 정리를 따라잡는다.
 *
 * ## 크론만으로는 사실상 한 번도 안 돈다
 *
 * `@Scheduled(cron = "0 0 3 * * *")`은 그 시각에 JVM이 살아 있어야 뜨는데,
 * **데스크탑 앱은 그 시간에 꺼져 있다.** 벽시계 대신 **"떴으니 밀린 걸 처리한다"**로 바꾼다.
 * 사용자가 앱을 여는 순간이 그 시점이다.
 *
 * **정확한 시각을 못 맞추는 건 감수한다** — 보존 30일짜리 일이라 하루이틀 늦어도 손해가 없다.
 *
 * ## v1.0에서 하는 일이 바뀌었다
 *
 * 원래는 감사 로그와 탈퇴 유예를 정리했는데 **둘 다 없어졌다.** 클래스를 지우려다,
 * API 호출 기록이 정확히 같은 성격(쌓이기만 하고 오래된 건 쓸모없음)이라 그쪽을 맡겼다.
 * 지우고 다시 만드는 것보다 **왜 이런 방식인지가 적힌 주석이 살아 있는 게 낫다**
 */
@Slf4j
@Profile("!test")   // 테스트가 뜰 때마다 배치가 도는 건 원치 않는다
@Component
@RequiredArgsConstructor
/*
 * 실행 순서를 못 박는다(2/2). @Order가 없으면 둘 다 LOWEST_PRECEDENCE라
 * **컴포넌트 스캔 발견 순서** = 파일시스템 열거 순서가 그대로 실행 순서가 된다.
 * 정리는 순서와 무관하지만 마지막이 자연스럽다
 */
@Order(3)
public class StartupCleanup implements ApplicationRunner {

    private final ApiCallLogRepository apiCallLogRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        try {
            int removed = apiCallLogRepository.deleteOlderThan(
                    AppClock.now().minusDays(SystemStatusService.RETENTION_DAYS));
            if (removed > 0) {
                log.info("API 호출 기록 {}건 정리 (보존 {}일)",
                        removed, SystemStatusService.RETENTION_DAYS);
            }
        } catch (RuntimeException e) {
            // **정리 실패가 기동을 막으면 안 된다.** 서비스는 정리 없이도 멀쩡히 돈다
            log.warn("API 호출 기록 정리 실패 — 서비스는 계속 뜬다", e);
        }
    }
}
