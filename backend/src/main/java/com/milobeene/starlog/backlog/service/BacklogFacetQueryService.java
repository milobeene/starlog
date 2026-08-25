package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.backlog.dto.FacetsResponse;
import com.milobeene.starlog.backlog.repository.AcquisitionRepository;
import com.milobeene.starlog.backlog.repository.BacklogEntryGenreRepository;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.backlog.repository.BacklogEntryTagRepository;
import com.milobeene.starlog.backlog.repository.PlaythroughRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 필터 사이드바 (화면 1 부속). 집계 5방을 그대로 합친다.
 *
 * 목록 조회와 분리한 이유 — 사이드바는 목록 페이지를 넘길 때마다 다시 계산할 필요가 없다.
 * 한 응답에 묶으면 페이지를 넘길 때마다 집계 5방이 따라붙는다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BacklogFacetQueryService {

    private final BacklogEntryTagRepository backlogEntryTagRepository;
    private final BacklogEntryGenreRepository backlogEntryGenreRepository;
    private final BacklogEntryRepository backlogEntryRepository;
    private final PlaythroughRepository playthroughRepository;
    private final AcquisitionRepository acquisitionRepository;

    public FacetsResponse findFacets(Long memberId) {
        return new FacetsResponse(
                backlogEntryTagRepository.countByTag(memberId),
                backlogEntryGenreRepository.countByGenre(memberId),
                backlogEntryRepository.countByStatus(memberId),
                playthroughRepository.countByDevice(memberId),
                acquisitionRepository.countByPlatformAccount(memberId));
    }
}
