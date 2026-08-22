package com.milobeene.gamebacklog.admin.service;

import com.milobeene.gamebacklog.admin.domain.AuditLog;
import com.milobeene.gamebacklog.admin.repository.AuditLogRepository;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;

/** 감사 로그 (FR-ADM-05, NFR-S8) */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditLogService {

    /** OI-08 결정: 1년 */
    public static final Duration RETENTION = Duration.ofDays(365);

    private final AuditLogRepository auditLogRepository;
    private final MemberRepository memberRepository;

    /**
     * **별도 트랜잭션(REQUIRES_NEW)에서 기록한다.**
     *
     * 같은 트랜잭션에 태우면 관리자 행위가 실패해 롤백될 때 "시도했다"는 기록까지 같이 사라진다.
     * 감사 로그는 성공한 일만이 아니라 **시도한 일**을 남기는 물건이다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Long actorId, String action, String targetType, Long targetId,
                       String requestIp, String userAgent) {
        memberRepository.findById(actorId).ifPresent(actor ->
                auditLogRepository.persist(
                        AuditLog.of(actor, action, targetType, targetId, requestIp, userAgent)));
    }

    @Scheduled(cron = "${app.cleanup.audit-log-cron}")
    public void cleanUp() {
        int deleted = purge(LocalDateTime.now().minus(RETENTION));
        if (deleted > 0) {
            log.info("보존 기간이 지난 감사 로그 {}건 정리", deleted);
        }
    }

    @Transactional
    public int purge(LocalDateTime threshold) {
        return auditLogRepository.deleteOlderThan(threshold);
    }
}
