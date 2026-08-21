package com.milobeene.gamebacklog.backlog.repository;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntryGenre;
import com.milobeene.gamebacklog.common.repository.BaseRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import com.milobeene.gamebacklog.backlog.dto.FacetCount;

import java.util.List;

public interface BacklogEntryGenreRepository extends BaseRepository<BacklogEntryGenre, Long> {

    /** 장르별 항목 수 (H-4). 개인 장르 기준이다 — 마스터 폴백은 세지 않는다 */
    @Query("select new com.milobeene.gamebacklog.backlog.dto.FacetCount(" +
            "   g.genre.id, g.genre.name, count(distinct g.backlogEntry.id))" +
            " from BacklogEntryGenre g" +
            " where g.genre.member.id = :memberId and g.backlogEntry.deletedAt is null" +
            " group by g.genre.id, g.genre.name" +
            " order by g.genre.name asc")
    List<FacetCount> countByGenre(@Param("memberId") Long memberId);

    List<BacklogEntryGenre> findByBacklogEntryId(Long backlogEntryId);

    /** 장르를 명시적으로 삭제할 때 연결부터 정리하는 용도 */
    List<BacklogEntryGenre> findByGenreId(Long genreId);
}
