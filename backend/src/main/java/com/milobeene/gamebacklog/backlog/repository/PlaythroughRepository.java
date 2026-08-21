package com.milobeene.gamebacklog.backlog.repository;

import com.milobeene.gamebacklog.backlog.domain.Playthrough;
import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.backlog.dto.FacetCount;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PlaythroughRepository extends BaseRepository<Playthrough, Long> {

    /**
     * 형제 회차 전체. 겹침 검사(BR-PT-02)와 번호 채번에 쓴다.
     * 항목당 몇 개 수준이라 통째로 읽어 자바에서 판정한다
     */
    List<Playthrough> findByBacklogEntryIdOrderBySequenceNoAsc(Long backlogEntryId);

    /**
     * 상세 화면용 (H-2). 회차마다 기기·계정·에뮬을 따로 읽으면 회차 수만큼 쿼리가 붙는다.
     * 전부 ~ToOne이라 join fetch로 한 방에 끝난다 (행이 늘지 않으므로 안전하다)
     */
    @Query("select p from Playthrough p" +
            " left join fetch p.device" +
            " left join fetch p.platformAccount" +
            " left join fetch p.emulator" +
            " where p.backlogEntry.id = :entryId" +
            " order by p.sequenceNo asc")
    List<Playthrough> findAllWithReferences(@Param("entryId") Long entryId);

    /** 기기별 항목 수 (H-4). 회차가 기기를 가리키므로 회차에서 센다 */
    @Query("select new com.milobeene.gamebacklog.backlog.dto.FacetCount(" +
            "   p.device.id, p.device.name, count(distinct p.backlogEntry.id))" +
            " from Playthrough p" +
            " where p.backlogEntry.member.id = :memberId" +
            "   and p.backlogEntry.deletedAt is null and p.device is not null" +
            " group by p.device.id, p.device.name" +
            " order by p.device.name asc")
    List<FacetCount> countByDevice(@Param("memberId") Long memberId);
}
