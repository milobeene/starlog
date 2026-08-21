package com.milobeene.gamebacklog.backlog.service;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.dto.BacklogCardResponse;
import com.milobeene.gamebacklog.backlog.dto.BacklogDetailResponse;
import com.milobeene.gamebacklog.backlog.dto.BacklogSort;
import com.milobeene.gamebacklog.backlog.repository.AcquisitionRepository;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryRepository;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryTagRepository;
import com.milobeene.gamebacklog.backlog.repository.PlaythroughRepository;
import com.milobeene.gamebacklog.common.dto.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 화면 단위 조회 전용 서비스 (API 설계서 §0). 쓰기는 BacklogService가 그대로 맡는다.
 *
 * **DTO를 반환하는 게 핵심이다.** 엔티티를 돌려주면 open-in-view: false 때문에
 * 컨트롤러가 LAZY를 건드리는 순간 터진다. 변환이 이 트랜잭션 안에서 끝나야 한다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BacklogQueryService {

    private static final int MAX_SIZE = 100;

    private final BacklogEntryRepository backlogEntryRepository;
    private final BacklogEntryTagRepository backlogEntryTagRepository;
    private final PlaythroughRepository playthroughRepository;
    private final AcquisitionRepository acquisitionRepository;
    private final BacklogEntryFinder backlogEntryFinder;

    public PageResponse<BacklogCardResponse> findCards(Long memberId, int page, int size, BacklogSort sort) {
        Pageable pageable = PageRequest.of(normalizePage(page), normalizeSize(size), sort.toSort());

        Page<BacklogEntry> entries = backlogEntryRepository.findCards(memberId, pageable);

        // Page.map()이 여기(트랜잭션 안)서 돌아야 장르 LAZY 로딩이 살아있다
        return PageResponse.from(entries.map(BacklogCardResponse::from));
    }

    /**
     * 상세 (화면 2). 회차·취득·태그를 각각 한 방씩 미리 뽑아 DTO에 넘긴다.
     * 엔티티의 LAZY 컬렉션을 그냥 훑으면 회차마다 기기·계정·에뮬 쿼리가 따라붙는다
     */
    public BacklogDetailResponse findDetail(Long memberId, Long entryId) {
        BacklogEntry entry = backlogEntryFinder.findOwnedWithGame(memberId, entryId);

        return BacklogDetailResponse.from(
                entry,
                backlogEntryTagRepository.findTagNames(entryId),
                playthroughRepository.findAllWithReferences(entryId),
                acquisitionRepository.findAllWithReferences(entryId));
    }

    /** 서버는 클라이언트를 믿지 않는다. size=100000이 오면 그대로 실행하지 않는다 */
    private int normalizeSize(int size) {
        return Math.clamp(size, 1, MAX_SIZE);
    }

    private int normalizePage(int page) {
        return Math.max(page, 0);
    }
}
