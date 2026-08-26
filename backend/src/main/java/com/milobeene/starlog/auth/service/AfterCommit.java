package com.milobeene.starlog.auth.service;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 커밋이 끝난 뒤에 실행한다. 트랜잭션이 없으면 즉시 실행.
 *
 * **인증 메일이 이걸 필요로 하는 이유** — 발송이 트랜잭션 안에 있으면 두 가지가 겹친다:
 *   1) Resend HTTP 왕복 내내 DB 커넥션을 붙잡는다 (무료 티어 풀이 작아 더 아프다)
 *   2) 발송 뒤 커밋이 실패하면 **토큰 해시가 저장되지 않은 죽은 링크**가 사용자에게 간다.
 *      사용자는 링크를 눌렀는데 "유효하지 않은 링크"를 보게 된다
 *
 * 반대 방향(커밋은 됐는데 발송 실패)은 이미 감수하기로 한 쪽이다 — AuthMailSender가
 * 실패를 삼키고 서버 로그에 수동 링크를 남긴다. 재발송 경로도 있다
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
