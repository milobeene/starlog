package com.milobeene.gamebacklog.backlog.repository;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntryTag;
import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.backlog.dto.FacetCount;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BacklogEntryTagRepository extends BaseRepository<BacklogEntryTag, Long> {

    List<BacklogEntryTag> findByBacklogEntryId(Long backlogEntryId);

    /** 태그를 명시적으로 삭제할 때(FR-TAG-02) 연결부터 정리하는 용도 */
    List<BacklogEntryTag> findByTagId(Long tagId);

    /** 상세 화면용 (H-2). 이름만 필요하므로 연결 엔티티를 로드하지 않는다 */
    @Query("select t.tag.name from BacklogEntryTag t" +
            " where t.backlogEntry.id = :entryId" +
            " order by t.tag.name asc")
    List<String> findTagNames(@Param("entryId") Long entryId);

    /**
     * 태그별 항목 수 (H-4, 화면 1 사이드바).
     * count(distinct ...)인 이유 — 한 항목에 같은 태그가 두 번 붙을 일은 없지만,
     * 조인 결과를 세는 쿼리는 항상 무엇을 세는지 명시해두는 편이 안전하다
     */
    @Query("select new com.milobeene.gamebacklog.backlog.dto.FacetCount(" +
            "   t.tag.id, t.tag.name, count(distinct t.backlogEntry.id))" +
            " from BacklogEntryTag t" +
            " where t.tag.member.id = :memberId and t.backlogEntry.deletedAt is null" +
            " group by t.tag.id, t.tag.name" +
            " order by t.tag.name asc")
    List<FacetCount> countByTag(@Param("memberId") Long memberId);
}
