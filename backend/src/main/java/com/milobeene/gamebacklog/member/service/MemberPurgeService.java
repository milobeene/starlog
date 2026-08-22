package com.milobeene.gamebacklog.member.service;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
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
@RequiredArgsConstructor
public class MemberPurgeService {

    private final EntityManager em;

    /** 자식 → 부모 순서. 이 목록의 순서가 곧 명세다 */
    private static final List<String> DELETE_ORDER = List.of(
            "delete from BacklogEntryTag x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from BacklogEntryGenre x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from CoverImage x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from Acquisition x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from Playthrough x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :memberId)",
            "delete from BacklogEntry b where b.member.id = :memberId",
            "delete from EntitySnapshot s where s.changedBy.id = :memberId",
            "delete from AuthToken t where t.member.id = :memberId",
            "delete from AuditLog l where l.actor.id = :memberId",
            "delete from Subscription s where s.member.id = :memberId",
            "delete from MemberDevice d where d.member.id = :memberId",
            "delete from PlatformAccount a where a.member.id = :memberId",
            "delete from Tag t where t.member.id = :memberId",
            "delete from Genre g where g.member.id = :memberId",
            "delete from Member m where m.id = :memberId");

    /** 유예가 끝난 회원을 전부 지운다 */
    @Transactional
    public int purgeExpired(LocalDateTime threshold) {
        List<Long> targets = em.createQuery("""
                        select m.id from Member m
                         where m.deletedAt is not null
                           and m.deletedAt < :threshold
                        """, Long.class)
                .setParameter("threshold", threshold)
                .getResultList();

        targets.forEach(this::purge);

        if (!targets.isEmpty()) {
            log.info("유예 만료 회원 {}명 물리 삭제", targets.size());
        }
        return targets.size();
    }

    @Transactional
    public void purge(Long memberId) {
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
    }
}
