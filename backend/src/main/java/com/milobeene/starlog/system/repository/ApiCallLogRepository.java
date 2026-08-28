package com.milobeene.starlog.system.repository;

import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.system.domain.ApiCallLog;
import com.milobeene.starlog.system.domain.ApiProvider;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface ApiCallLogRepository extends BaseRepository<ApiCallLog, Long> {

    /** 창(window) 하나의 호출 수. 화면이 1분·24시간·30일을 각각 물어본다 */
    @Query("select count(l) from ApiCallLog l" +
            " where l.provider = :provider and l.calledAt >= :since")
    long countSince(@Param("provider") ApiProvider provider,
                    @Param("since") LocalDateTime since);

    @Query("select count(l) from ApiCallLog l" +
            " where l.provider = :provider and l.calledAt >= :since and l.success = false")
    long countFailedSince(@Param("provider") ApiProvider provider,
                          @Param("since") LocalDateTime since);

    /**
     * 창 하나에서 쓴 **양의 합계** (번역의 글자 수).
     *
     * ⚠️ **`coalesce`가 없으면 행이 하나도 없을 때 `null`이 온다.** 그 값을 그대로 더하면
     * NPE고, `long`으로 받으면 언박싱에서 터진다 — 돈이 걸린 계산이라 0으로 못 박는다.
     *
     * 성공·실패를 안 가린다. 실패해도 구글은 이미 글자를 받아 세었을 수 있다 —
     * **적게 세는 쪽이 위험하다**
     */
    @Query("select coalesce(sum(l.units), 0) from ApiCallLog l" +
            " where l.provider = :provider and l.calledAt >= :since")
    long sumUnitsSince(@Param("provider") ApiProvider provider,
                       @Param("since") LocalDateTime since);

    /** 가장 오래된 기록. 화면의 "언제부터 센 것인지"에 쓴다 */
    @Query("select min(l.calledAt) from ApiCallLog l where l.provider = :provider")
    LocalDateTime oldestOf(@Param("provider") ApiProvider provider);

    /**
     * 보존 기간 만료 삭제.
     *
     * 벌크는 영속성 컨텍스트를 우회하므로 flush·clear를 걸어야 한다 (설계 원칙 13번).
     * `updatedAt`을 만질 일은 없다 — 지우기만 한다
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from ApiCallLog l where l.calledAt < :threshold")
    int deleteOlderThan(@Param("threshold") LocalDateTime threshold);
}
