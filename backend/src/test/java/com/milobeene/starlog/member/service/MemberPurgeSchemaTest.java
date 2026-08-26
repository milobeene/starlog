package com.milobeene.starlog.member.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import com.milobeene.starlog.common.quota.QuotaGuard;
import com.milobeene.starlog.common.quota.QuotaKind;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;

/**
 * 회원 물리 삭제를 **배포 스키마 위에서** 검증한다.
 *
 * ## 왜 이 테스트가 따로 필요한가
 * 나머지 테스트는 `ddl-auto: create`가 만든 **엔티티 스키마**에서 돈다. 그런데
 * `UsageQuota`는 회원을 `@ManyToOne`이 아니라 `@EmbeddedId` 안의 `Long memberId`로 들고 있어서,
 * **엔티티 스키마에는 `member`로 향하는 FK가 아예 안 생긴다.** 반면 배포 스키마(V3)에는
 * `fk_usage_quota_member`가 실재한다.
 *
 * 그래서 `MemberPurgeService.DELETE_ORDER`에서 `UsageQuota`가 빠졌을 때
 * **테스트 440여 개가 전부 초록인 채로 운영의 파기 배치만 매일 조용히 실패했다** —
 * `purgeExpired`가 예외를 삼키고 로그만 남기기 때문에 아무도 몰랐다.
 *
 * 여기는 `spring.flyway.enabled=true` + `ddl-auto=validate`로 **진짜 배포 스키마**를 쓴다.
 * FK가 실재하므로 삭제 순서에 구멍이 있으면 바로 터진다.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:purge-schema;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.flyway.enabled=true",
        "spring.jpa.hibernate.ddl-auto=validate"
})
@ActiveProfiles("test")
class MemberPurgeSchemaTest {

    @Autowired MemberPurgeService memberPurgeService;
    @Autowired MemberRepository memberRepository;
    @Autowired QuotaGuard quotaGuard;
    @Autowired EntityManager em;
    /*
     * **클래스에 @Transactional을 못 붙인다.** `purgeExpired`가 Propagation.NEVER라
     * 바깥 트랜잭션이 있으면 예외로 터진다 — 일부러 그렇게 못 박아 둔 것이다.
     * 그래서 픽스처만 각자의 트랜잭션에서 만들고, 파기는 트랜잭션 밖에서 부른다
     */
    @Autowired TransactionTemplate tx;

    @Test
    void 쿼터를_쓴_회원도_물리_삭제된다() {
        //given — 게임을 한 번이라도 검색한 회원이면 usage_quota에 행이 남는다.
        //        즉 **사실상 전원**이 이 경우다
        Long memberId = withdrawnMemberUsing(QuotaKind.GAME_SEARCH, "purge");

        //when //then — FK 위반이 나면 여기서 터진다
        assertThatCode(() -> memberPurgeService.purge(memberId))
                .doesNotThrowAnyException();

        //then
        assertThat(existsMember(memberId)).as("회원 행이 남아 있으면 파기가 실패한 것이다").isFalse();
        assertThat(countQuotaRows(memberId)).isZero();
    }

    @Test
    void 유예_만료_배치가_쿼터를_쓴_회원을_실제로_지운다() {
        //given — purgeExpired는 예외를 삼키므로, 안 지워진 것을 결과로 확인해야 한다
        Long memberId = withdrawnMemberUsing(QuotaKind.COVER_UPLOAD, "expired");

        //when
        MemberPurgeService.PurgeResult result =
                memberPurgeService.purgeExpired(LocalDateTime.now().minusDays(30));

        //then
        assertThat(result.purgedMembers()).isPositive();
        assertThat(existsMember(memberId)).isFalse();
    }

    private boolean existsMember(Long memberId) {
        return Boolean.TRUE.equals(
                tx.execute(status -> memberRepository.findById(memberId).isPresent()));
    }

    /**
     * 유예가 끝난 회원 + 쿼터 한 건. 게임을 한 번이라도 검색했으면 이 상태가 된다.
     *
     * **트랜잭션을 셋으로 나눈다.** 쿼터 행 생성이 REQUIRES_NEW라 별도 커넥션에서 도는데,
     * 회원이 아직 커밋 안 된 상태면 그쪽에서 `fk_usage_quota_member`를 만족시킬 수 없다.
     * 운영에서는 회원이 한참 전에 커밋돼 있어 생기지 않는 상황이지만, 테스트에서는
     * 순서를 명시해야 한다
     */
    private Long withdrawnMemberUsing(QuotaKind kind, String prefix) {
        Long memberId = tx.execute(status -> {
            Member member = Member.signUpWithEmail(
                    prefix + System.nanoTime() + "@example.com", "encoded", "탈퇴자");
            memberRepository.persist(member);
            em.flush();
            return member.getId();
        });

        tx.executeWithoutResult(status -> quotaGuard.consume(memberId, kind));

        tx.executeWithoutResult(status -> memberRepository.findById(memberId)
                .orElseThrow()
                .withdraw(LocalDateTime.now().minusDays(31)));

        return memberId;
    }

    private long countQuotaRows(Long memberId) {
        return tx.execute(status -> em.createQuery(
                        "select count(q) from UsageQuota q where q.id.memberId = :id", Long.class)
                .setParameter("id", memberId)
                .getSingleResult());
    }
}
