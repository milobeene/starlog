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
