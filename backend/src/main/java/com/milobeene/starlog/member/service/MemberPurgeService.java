package com.milobeene.starlog.member.service;

import jakarta.persistence.EntityManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 유예 만료 회원의 물리 삭제 (FR-SYS-06, I-8).
 *
 * 리포지토리 15개를 만드는 대신 EntityManager를 직접 쓴다 — 이건 도메인 로직이 아니라
 * **삭제 순서가 전부인 정리 작업**이라 한 파일에서 순서를 읽을 수 있는 게 더 중요하다.
 *
 * 순서를 틀리면 FK 제약에 걸린다. 두 가지가 함정이다.
 *  1) `BacklogEntry ↔ Playthrough`는 **서로를 참조한다** (lastPlaythrough 비정규화, §7.2).
 *     항목의 참조를 먼저 끊어야 회차를 지울 수 있다
 *  2) 감사 로그는 "보존"이 요건인데 회원 삭제와 충돌한다. 지금은 함께 지운다 —
 *     관리자 계정을 탈퇴시킬 일이 실질적으로 없다는 전제다 (OI-08 재검토 대상)
 */
@Slf4j
@Service
public class MemberPurgeService {

    private final EntityManager em;

    /**
     * 자기 자신의 프록시. `@Transactional`은 프록시 기반이라 `this.purge()`로 부르면
     * 트랜잭션이 안 걸린다 (원칙 11번) — 회원별로 트랜잭션을 끊으려면 프록시를 거쳐야 한다.
     * 별도 빈으로 쪼개는 대신 자기 주입을 쓴 이유는, 삭제 순서가 이 파일 안에 다 보여야 하기 때문이다
     */
    private final MemberPurgeService self;

    public MemberPurgeService(EntityManager em, @Lazy MemberPurgeService self) {
        this.em = em;
        this.self = self;
    }

    /** 자식 → 부모 순서. 이 목록의 순서가 곧 명세다 */
    private static final List<String> DELETE_ORDER = List.of(
            "delete from BacklogEntryTag x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from BacklogEntryGenre x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from CoverImage x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from Acquisition x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from Playthrough x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from BacklogEntry b where b.member.id = :memberId",
            "delete from AuthToken t where t.member.id = :memberId",
            "delete from AuditLog l where l.actor.id = :memberId",
            "delete from Subscription s where s.member.id = :memberId",
            // 선택지 5종. 계정이 플랫폼을 참조하므로 계정 → 플랫폼 순서를 지켜야 한다
            "delete from PlatformAccount a where a.member.id = :memberId",
            "delete from Platform p where p.member.id = :memberId",
            "delete from Device d where d.member.id = :memberId",
            "delete from Emulator e where e.member.id = :memberId",
            "delete from InputMethod i where i.member.id = :memberId",
            "delete from Tag t where t.member.id = :memberId",
            "delete from Genre g where g.member.id = :memberId",
            "delete from Member m where m.id = :memberId");

    /**
     * DB 삭제 결과. coverStorageKeys는 **호출자가 트랜잭션 밖에서** 스토리지에서 지워야 한다 —
     * DB 커밋 전에 파일부터 지우면 롤백 시 "DB엔 있는데 파일이 없는" 최악이 나온다 (K-4와 같은 순서)
     */
    public record PurgeResult(int purgedMembers, List<String> coverStorageKeys) {}

    /**
     * 유예가 끝난 회원을 전부 지운다.
     *
     * ⚠️ **이 메서드에는 트랜잭션이 없다.** 대상 조회와 회원별 삭제가 각각 자기 트랜잭션을 갖는다.
     * 전원을 한 트랜잭션에 묶으면 한 명이 터질 때 그날 **전원이 롤백**되고, 배치가 매일 같은
     * 집합을 다시 뽑으므로 그 한 명이 영원히 배치를 막는다(poison pill). 실제로 그 상태였다.
     *
     * 실패한 회원은 로그만 남기고 넘어간다 — 다음 날 배치가 다시 시도하고, 그동안 나머지는 정리된다
     */
    public PurgeResult purgeExpired(LocalDateTime threshold) {
        List<Long> targets = findExpired(threshold);

        List<String> coverKeys = new ArrayList<>();
        int purged = 0;
        for (Long memberId : targets) {
            try {
                coverKeys.addAll(self.purge(memberId));
                purged++;
            } catch (RuntimeException e) {
                // 한 명의 실패가 나머지를 막지 않는다. 원인은 로그로 남겨 다음 날 재시도된다
                log.error("회원 물리 삭제 실패 — 건너뛴다. memberId={}", memberId, e);
            }
        }

        if (!targets.isEmpty()) {
            log.info("유예 만료 회원 {}/{}명 물리 삭제 (커버 파일 {}건 정리 대상)",
                    purged, targets.size(), coverKeys.size());
        }
        return new PurgeResult(purged, coverKeys);
    }

    @Transactional(readOnly = true)
    public List<Long> findExpired(LocalDateTime threshold) {
        return em.createQuery("""
                        select m.id from Member m
                         where m.deletedAt is not null
                           and m.deletedAt < :threshold
                        """, Long.class)
                .setParameter("threshold", threshold)
                .getResultList();
    }

    @Transactional
    public List<String> purge(Long memberId) {
        /*
         * 스토리지 key를 **행을 지우기 전에** 모아둔다. CoverImage 행이 사라지면
         * 어떤 파일이 이 회원 것이었는지 알 길이 없다 — 그러면 R2에 탈퇴 회원의
         * 이미지가 영구히 남는다. 삭제 자체는 호출자가 커밋 뒤에 한다
         */
        List<String> coverKeys = em.createQuery("""
                        select c.storageKey from CoverImage c
                         where c.backlogEntry.member.id = :memberId
                        """, String.class)
                .setParameter("memberId", memberId)
                .getResultList();

        // 항목 → 회차 순환 참조를 먼저 끊는다. 벌크는 콜백이 안 도니 updatedAt을 직접 쓴다 (원칙 13번)
        em.createQuery("""
                        update BacklogEntry b
                           set b.lastPlaythrough = null, b.updatedAt = :now
                         where b.member.id = :memberId
                        """)
                .setParameter("memberId", memberId)
                .setParameter("now", LocalDateTime.now())
                .executeUpdate();

        DELETE_ORDER.forEach(jpql -> em.createQuery(jpql)
                .setParameter("memberId", memberId)
                .executeUpdate());

        // 벌크는 영속성 컨텍스트를 우회한다 → 남아있는 1차 캐시가 이미 지워진 행을 가리키지 않게 비운다
        em.clear();

        return coverKeys;
    }
}
