package com.milobeene.gamebacklog.backlog.repository;

import com.milobeene.gamebacklog.backlog.domain.Playthrough;
import com.milobeene.gamebacklog.common.repository.BaseRepository;

import java.util.List;

public interface PlaythroughRepository extends BaseRepository<Playthrough, Long> {

    /**
     * 형제 회차 전체. 겹침 검사(BR-PT-02)와 번호 채번에 쓴다.
     * 항목당 몇 개 수준이라 통째로 읽어 자바에서 판정한다
     */
    List<Playthrough> findByBacklogEntryIdOrderBySequenceNoAsc(Long backlogEntryId);
}
