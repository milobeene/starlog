package com.milobeene.starlog.common.config;

import com.milobeene.starlog.admin.service.AuditLogService;
import com.milobeene.starlog.member.service.WithdrawalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 뜰 때 밀린 정리를 따라잡는다.
 *
 * **크론만으로는 이 배치들이 사실상 한 번도 안 돈다.** `@Scheduled(cron = "0 0 3 * * *")`은
 * 그 시각에 JVM이 살아 있어야 뜨는데,
 *   - Render 무료는 15분 무활동에 인스턴스를 내린다 → 새벽 3시에 깨어 있을 리가 없다
 *   - 로컬 앱(v1.0)은 아예 꺼져 있다
 * 그래서 "매일 03:00 정리"는 문서에만 있고 실제로는 안 일어났다.
 *
 * 벽시계 대신 **"떴으니 밀린 걸 처리한다"**로 바꾼다. 서버는 첫 요청에 깨어나므로 실제로 돌고,
 * 로컬 앱은 사용자가 앱을 여는 순간이 그 시점이다. 크론은 그대로 남겨둔다 —
 * 언젠가 상시 켜진 서버가 되면 그때는 그쪽이 제 몫을 한다.
 *
 * **정확한 시각을 못 맞추는 건 감수한다.** 보존 365일·유예 30일짜리 일이라
 * 하루이틀 늦게 정리돼도 아무도 손해 보지 않는다.
 */
@Slf4j
@Profile("!test")   // 테스트가 뜰 때마다 배치가 도는 건 원치 않는다. 각 배치는 자기 테스트가 따로 있다
@Component
@RequiredArgsConstructor
/*
 * 실행 순서를 못 박는다(3/3). @Order가 없으면 셋 다 LOWEST_PRECEDENCE라
 * **컴포넌트 스캔 발견 순서** = 파일시스템 열거 순서가 그대로 실행 순서가 된다.
 * 정리는 순서와 무관하지만 마지막이 자연스럽다
 */
@Order(3)
public class StartupCleanup implements ApplicationRunner {

    private final AuditLogService auditLogService;
    private final WithdrawalService withdrawalService;

    @Override
    public void run(ApplicationArguments args) {
        /*
         * 셋을 각각 감싼다 — 하나가 실패해도 나머지는 돌아야 하고,
         * 무엇보다 **정리 실패가 기동을 막으면 안 된다.** 서비스는 정리 없이도 멀쩡히 돈다
         */
        attempt("감사 로그", auditLogService::cleanUp);
        attempt("탈퇴 유예 만료", withdrawalService::purgeExpired);
    }

    private void attempt(String what, Runnable task) {
        try {
            task.run();
        } catch (RuntimeException e) {
            log.warn("기동 시 정리 실패 — {}. 서비스는 계속 뜬다", what, e);
        }
    }
}
