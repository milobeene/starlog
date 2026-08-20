package com.milobeene.gamebacklog.tag.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.tag.domain.Genre;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface GenreRepository extends BaseRepository<Genre, Long> {

    /** find-or-create의 find 쪽. uk_genre_member_name과 짝이다 */
    Optional<Genre> findByMemberIdAndName(Long memberId, String name);

    /** 사전 목록. 태그와 같은 자동 소멸 메커니즘 (§6.7 v1.5 개정) */
    @Query("select distinct g from Genre g" +
            " join BacklogEntryGenre l on l.genre = g" +
            " where g.member.id = :memberId order by g.name")
    List<Genre> findUsedByMemberId(@Param("memberId") Long memberId);
}
