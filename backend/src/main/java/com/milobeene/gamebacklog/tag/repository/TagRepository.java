package com.milobeene.gamebacklog.tag.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.tag.domain.Tag;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface TagRepository extends BaseRepository<Tag, Long> {

    /** find-or-create의 find 쪽. uk_tag_member_name과 짝이다 */
    Optional<Tag> findByMemberIdAndName(Long memberId, String name);

    /**
     * 사전 목록 (자동완성·필터 옵션). 연결이 1건 이상인 것만 나온다 — 이게 자동 소멸이다.
     * 사전 행을 지우지 않고 조회에서 거르므로 COUNT→DELETE의 경쟁 상태가 없다 (§6.7 v1.5 개정)
     */
    @Query("select distinct t from Tag t" +
            " join BacklogEntryTag l on l.tag = t" +
            " where t.member.id = :memberId order by t.name")
    List<Tag> findUsedByMemberId(@Param("memberId") Long memberId);
}
