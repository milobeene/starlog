package com.milobeene.starlog.backlog.repository;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.dto.BacklogSearchCondition;
import com.milobeene.starlog.backlog.dto.BacklogSort;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;

/**
 * 동적 쿼리 조각 (L-1). Spring Data가 `BacklogEntryRepositoryImpl`을 찾아 붙인다.
 *
 * 별도 인터페이스로 뽑은 이유 — @Query 어노테이션으로는 조건 6개의 조합을 표현할 수 없다.
 * 정렬을 Pageable이 아니라 BacklogSort로 받는 이유는 QueryDSL이 Sort를 못 받기 때문이다
 */
public interface BacklogEntryRepositoryCustom {

    Page<BacklogEntry> search(Long memberId, BacklogSearchCondition condition,
                              BacklogSort sort, Pageable pageable);

    /**
     * **전부** 준다 (v1.1.2). 페이지가 없다.
     *
     * 사이드바와 폴더 뷰는 "한 페이지"가 아니라 "내 기록 전체"가 있어야 성립한다 —
     * 태그별로 나눠 담고 개수를 세는 화면이라 하나라도 빠지면 **그 항목은 태그가
     * 없는 것처럼 보인다.** 예전엔 `size=100`으로 대신했는데, 항목이 100을 넘는
     * 순간 뒤쪽이 조용히 잘렸다 (실제로 105개에서 다섯이 사라졌다).
     */
    List<BacklogEntry> findAllCards(Long memberId);
}
