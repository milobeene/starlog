package com.milobeene.gamebacklog.backlog.repository;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntryTag;
import com.milobeene.gamebacklog.common.repository.BaseRepository;

import java.util.List;

public interface BacklogEntryTagRepository extends BaseRepository<BacklogEntryTag, Long> {

    List<BacklogEntryTag> findByBacklogEntryId(Long backlogEntryId);

    /** 태그를 명시적으로 삭제할 때(FR-TAG-02) 연결부터 정리하는 용도 */
    List<BacklogEntryTag> findByTagId(Long tagId);
}
