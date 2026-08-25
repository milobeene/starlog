package com.milobeene.starlog.backlog.repository;

import com.milobeene.starlog.backlog.domain.Acquisition;
import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.backlog.dto.FacetCount;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AcquisitionRepository extends BaseRepository<Acquisition, Long> {

    /** 한 항목의 취득 전체. 재구매·DLC로 여러 건이 쌓인다 (FR-ACQ-06) */
    List<Acquisition> findByBacklogEntryIdOrderByIdAsc(Long backlogEntryId);

    /** 상세 화면용 (H-2). 회차와 같은 이유로 ~ToOne을 전부 끌고 온다 */
    @Query("select a from Acquisition a" +
            " left join fetch a.platform" +
            " left join fetch a.platformAccount" +
            " left join fetch a.subscription" +
            " where a.backlogEntry.id = :entryId" +
            " order by a.id asc")
    List<Acquisition> findAllWithReferences(@Param("entryId") Long entryId);

    /**
     * 플랫폼 계정별 항목 수 (H-4).
     *
     * 회차가 아니라 취득에서 세는 이유 — 계정 필터는 "그 계정으로 가진 게임"을 뜻한다.
     * 회차의 계정은 "그때 어느 계정으로 플레이했나"라서 의미가 다르다.
     * 삭제된 계정도 세지 않는다 — 선택지 목록에서 이미 빠져 고를 수 없기 때문이다
     */
    @Query("select new com.milobeene.starlog.backlog.dto.FacetCount(" +
            "   a.platformAccount.id, a.platformAccount.accountLabel," +
            "   count(distinct a.backlogEntry.id))" +
            " from Acquisition a" +
            " where a.backlogEntry.member.id = :memberId" +
            "   and a.backlogEntry.deletedAt is null" +
            "   and a.platformAccount is not null and a.platformAccount.deletedAt is null" +
            " group by a.platformAccount.id, a.platformAccount.accountLabel" +
            " order by a.platformAccount.accountLabel asc")
    List<FacetCount> countByPlatformAccount(@Param("memberId") Long memberId);
}
