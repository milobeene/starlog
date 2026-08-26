package com.milobeene.starlog.common.quota;

import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.common.quota.UsageQuota.UsageQuotaId;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface UsageQuotaRepository extends BaseRepository<UsageQuota, UsageQuotaId> {

    /**
     * 있으면 1 올리고, 없으면 0행을 돌려준다.
     *
     * **네이티브 upsert(`on conflict` / `merge into`)를 안 쓴다** — H2와 PostgreSQL의 문법이
     * 갈려 dev와 prod가 다른 코드를 타게 된다. 대신 "UPDATE 해보고 0행이면 INSERT"로 간다.
     *
     * 벌크라 영속성 컨텍스트를 우회한다 → clear가 필요하지만, 이 호출은 요청 맨 앞에서
     * 한 번만 돌고 뒤에 읽을 엔티티가 아직 없다. flush만 켜서 앞선 쓰기를 잃지 않게 한다.
     * updated_at은 콜백이 안 도니 SET 절에 직접 쓴다 (설계 원칙 13)
     */
    @Modifying(flushAutomatically = true)
    @Query("""
            update UsageQuota q
               set q.used = q.used + 1, q.updatedAt = CURRENT_TIMESTAMP
             where q.id.memberId = :memberId and q.id.usageDate = :date and q.id.kind = :kind
            """)
    int increment(@Param("memberId") Long memberId,
                  @Param("date") LocalDate date,
                  @Param("kind") QuotaKind kind);

    @Query("""
            select q from UsageQuota q
             where q.id.memberId = :memberId and q.id.usageDate = :date
            """)
    List<UsageQuota> findDay(@Param("memberId") Long memberId, @Param("date") LocalDate date);

    /**
     * 한도 검사 전용. **엔티티가 아니라 스칼라를 뽑는다** —
     * 엔티티로 읽으면 영속성 컨텍스트의 1차 캐시가 끼어들어, 같은 트랜잭션에서 벌크 UPDATE가
     * 이미 돌았어도 옛 값을 돌려줄 수 있다. 스칼라 조회는 매번 DB를 본다
     */
    @Query("""
            select q.used from UsageQuota q
             where q.id.memberId = :memberId and q.id.usageDate = :date and q.id.kind = :kind
            """)
    Optional<Integer> findUsed(@Param("memberId") Long memberId,
                               @Param("date") LocalDate date,
                               @Param("kind") QuotaKind kind);

    /** 관리자 시스템 탭 — 오늘 누가 얼마나 썼나. 날짜 인덱스를 탄다 */
    @Query("select q from UsageQuota q where q.id.usageDate = :date order by q.used desc")
    List<UsageQuota> findAllOn(@Param("date") LocalDate date);
}
