package com.milobeene.starlog.common.util;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 커밋이 끝난 뒤에 실행한다. 트랜잭션이 없으면 즉시 실행.
 *
 * **왜 필요한가** — 외부로 나가는 부수효과(파일 삭제, 메일 발송)를 트랜잭션 안에서 하면
 * 두 가지가 겹친다:
 *   1) HTTP 왕복 내내 DB 커넥션을 붙잡는다
 *   2) 부수효과 뒤 커밋이 실패하면 **DB에는 없는데 바깥에는 일어난 일**이 남는다
 *
 * 지금 쓰는 곳은 커버 삭제다 — 항목을 지울 때 R2 파일도 지우는데, 커밋 전에 지우면
 * 롤백됐을 때 이미지만 사라진 항목이 남는다.
 *
 * 원래 `auth/service`에 있었다(인증 메일이 첫 사용처였다). v1.0에서 인증이 사라지면서
 * 여기로 옮겼다 — 애초에 인증과 무관한 범용 도구다
 */
public final class AfterCommit {

    private AfterCommit() {}

    public static void run(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
