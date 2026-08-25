package com.milobeene.starlog.backlog.repository;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.dto.BacklogSearchCondition;
import com.milobeene.starlog.backlog.dto.BacklogSort;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * 동적 쿼리 조각 (L-1). Spring Data가 `BacklogEntryRepositoryImpl`을 찾아 붙인다.
 *
 * 별도 인터페이스로 뽑은 이유 — @Query 어노테이션으로는 조건 6개의 조합을 표현할 수 없다.
 * 정렬을 Pageable이 아니라 BacklogSort로 받는 이유는 QueryDSL이 Sort를 못 받기 때문이다
 */
public interface BacklogEntryRepositoryCustom {

    Page<BacklogEntry> search(Long memberId, BacklogSearchCondition condition,
                              BacklogSort sort, Pageable pageable);
}
