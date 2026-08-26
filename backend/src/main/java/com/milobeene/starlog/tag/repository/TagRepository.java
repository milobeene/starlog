package com.milobeene.starlog.tag.repository;

import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.tag.domain.Tag;
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
            " join BacklogEntry b on b.tag = t" +
            " where t.member.id = :memberId" +
            " and b.deletedAt is null" +   // 삭제된 항목에만 붙은 태그는 숨긴다. 되살리면 다시 나온다
            " order by t.name")
    List<Tag> findUsedByMemberId(@Param("memberId") Long memberId);
}
