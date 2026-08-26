package com.milobeene.starlog.backlog.repository;

import com.milobeene.starlog.backlog.domain.CoverImage;
import com.milobeene.starlog.common.repository.BaseRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface CoverImageRepository extends BaseRepository<CoverImage, Long> {

    Optional<CoverImage> findByBacklogEntryId(Long backlogEntryId);

    /**
     * 목록 카드용 (K-5). BacklogEntry에 역방향 필드를 두지 않았으므로
     * 화면 한 페이지 분량의 entryId를 모아 **한 번에** 읽는다.
     * 항목마다 findByBacklogEntryId를 부르면 그게 N+1이다.
     * **빈 컬렉션을 넘기면 `in ()`이 되므로 호출부가 막는다**
     */
    List<CoverImage> findByBacklogEntryIdIn(Collection<Long> backlogEntryIds);

    /** 회원 탈퇴·항목 물리 삭제 시 정리용. 스토리지 파일은 key를 받아 따로 지운다 */
    void delete(CoverImage coverImage);

    /**
     * WEB-ONLY: /admin 시스템 탭 — R2 사용량. **DB만으로 계산된다**
     * (스토리지에 물어보지 않는다 — 무료 티어에서 또 다른 외부 호출을 만들 이유가 없다).
     * 한 건도 없으면 sum이 null이라 coalesce로 0을 만든다
     */
    @Query("select coalesce(sum(c.sizeBytes), 0) from CoverImage c")
    long totalSizeBytes();

    @Query("select count(c) from CoverImage c")
    long countAll();
}
