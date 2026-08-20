package com.milobeene.gamebacklog.backlog.repository;

import com.milobeene.gamebacklog.backlog.domain.Acquisition;
import com.milobeene.gamebacklog.common.repository.BaseRepository;

import java.util.List;

public interface AcquisitionRepository extends BaseRepository<Acquisition, Long> {

    /** 한 항목의 취득 전체. 재구매·DLC로 여러 건이 쌓인다 (FR-ACQ-06) */
    List<Acquisition> findByBacklogEntryIdOrderByIdAsc(Long backlogEntryId);
}
