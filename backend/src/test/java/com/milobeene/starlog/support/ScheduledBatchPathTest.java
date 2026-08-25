package com.milobeene.starlog.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.starlog.admin.service.AuditLogService;
import com.milobeene.starlog.auth.domain.AuthToken;
import com.milobeene.starlog.auth.domain.TokenPurpose;
import com.milobeene.starlog.auth.service.AuthTokenCleaner;
import com.milobeene.starlog.member.domain.Member;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;

/**
 * 배치의 **스케줄러 호출 경로** 회귀 감시.
 *
 * 다른 배치 테스트는 전부 purge()를 직접 부르는데, 그 호출은 프록시를 거쳐 트랜잭션이 걸린다.
 * 스케줄러가 부르는 건 cleanUp()이고, 그 안의 this.purge()는 자기호출이라 프록시를 안 거친다
 * (원칙 11번) — cleanUp 쪽에 @Transactional이 없으면 @Modifying 벌크가
 * TransactionRequiredException으로 매일 터진다. 실제로 이 버그가 있었다.
 *
 * 그래서 이 클래스는 **일부러 트랜잭션 없이** 스케줄러와 같은 조건으로 cleanUp()을 부른다.
 * ControllerTestSupport를 상속하면 테스트 전체가 트랜잭션에 감싸져 버그가 재현되지 않는다.
 */
@SpringBootTest
@ActiveProfiles("test")
class ScheduledBatchPathTest {

    @Autowired AuthTokenCleaner authTokenCleaner;
    @Autowired AuditLogService auditLogService;
    @Autowired TransactionTemplate tx;
    @PersistenceContext EntityManager em;

    @Test
    public void 스케줄러가_부르는_cleanUp_경로도_토큰을_지운다() {
        //given — 유예(7일)까지 지난 만료 토큰. 데이터 준비만 트랜잭션으로 감싼다
        Long memberId = tx.execute(status -> {
            Member member = Member.signUpWithEmail(
                    "batch" + System.nanoTime() + "@example.com", "x", "배치테스터");
            em.persist(member);
            em.persist(new AuthToken(member, TokenPurpose.EMAIL_VERIFICATION,
                    "hash-" + System.nanoTime(), LocalDateTime.now().minusDays(30)));
            return member.getId();
        });

        //when — 스케줄러와 같은 조건: 바깥 트랜잭션 없음
        authTokenCleaner.cleanUp();

        //then
        Long remaining = tx.execute(status -> em.createQuery(
                        "select count(t) from AuthToken t where t.member.id = :id", Long.class)
                .setParameter("id", memberId)
                .getSingleResult());
        assertThat(remaining).isZero();

        // 공유 인메모리 DB라 남긴 회원은 직접 치운다 (이 클래스는 롤백이 없다)
        tx.executeWithoutResult(status -> em.createQuery(
                        "delete from Member m where m.id = :id")
                .setParameter("id", memberId)
                .executeUpdate());
    }

    @Test
    public void 감사_로그_cleanUp도_트랜잭션_없이_호출돼도_동작한다() {
        // 지울 행이 없어도 벌크는 실행된다 — 트랜잭션이 없으면 여기서 이미 터진다
        auditLogService.cleanUp();
    }
}
