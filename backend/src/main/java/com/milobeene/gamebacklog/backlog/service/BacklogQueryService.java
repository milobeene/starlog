package com.milobeene.gamebacklog.backlog.service;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.dto.BacklogCardResponse;
import com.milobeene.gamebacklog.backlog.dto.BacklogNameResponse;
import com.milobeene.gamebacklog.backlog.dto.CompanyDictionary;
import com.milobeene.gamebacklog.backlog.dto.BacklogDetailResponse;
import com.milobeene.gamebacklog.backlog.dto.BacklogSearchCondition;
import com.milobeene.gamebacklog.backlog.dto.BacklogSort;
import com.milobeene.gamebacklog.backlog.repository.AcquisitionRepository;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryRepository;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryTagRepository;
import com.milobeene.gamebacklog.backlog.repository.CoverImageRepository;
import com.milobeene.gamebacklog.backlog.repository.PlaythroughRepository;
import com.milobeene.gamebacklog.common.storage.FileStoragePort;
import com.milobeene.gamebacklog.common.dto.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

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
    private final CoverImageRepository coverImageRepository;
    private final FileStoragePort fileStorage;

    /**
     * 목록 (화면 1). L-1에서 검색·필터가 붙으며 QueryDSL 경로로 옮겼다.
     *
     * Pageable에 Sort를 싣지 않는 이유 — 정렬은 QueryDSL이 OrderSpecifier로 직접 건다.
     * 둘 다 넣으면 order by가 중복으로 나간다
     */
    public PageResponse<BacklogCardResponse> findCards(Long memberId, BacklogSearchCondition condition,
                                                       int page, int size, BacklogSort sort) {
        Pageable pageable = PageRequest.of(normalizePage(page), normalizeSize(size));

        Page<BacklogEntry> entries = backlogEntryRepository.search(memberId, condition, sort, pageable);

        // 이 페이지에 실린 항목의 커버만 한 방에 읽는다 (K-5).
        // 카드마다 findByBacklogEntryId를 부르면 그게 N+1이다
        Map<Long, String> coverUrls = coverUrlsOf(entries.getContent());

        // Page.map()이 여기(트랜잭션 안)서 돌아야 장르 LAZY 로딩이 살아있다
        return PageResponse.from(entries.map(
                entry -> BacklogCardResponse.from(entry, coverUrls.get(entry.getId()))));
    }

    /**
     * 상세 (화면 2). 회차·취득·태그를 각각 한 방씩 미리 뽑아 DTO에 넘긴다.
     * 엔티티의 LAZY 컬렉션을 그냥 훑으면 회차마다 기기·계정·에뮬 쿼리가 따라붙는다
     */
    public BacklogDetailResponse findDetail(Long memberId, Long entryId) {
        BacklogEntry entry = backlogEntryFinder.findOwnedWithGame(memberId, entryId);

        String coverUrl = coverImageRepository.findByBacklogEntryId(entryId)
                .map(cover -> fileStorage.publicUrl(cover.getStorageKey()))
                .orElse(null);

        return BacklogDetailResponse.from(
                entry,
                coverUrl,
                backlogEntryTagRepository.findTagNames(entryId),
                playthroughRepository.findAllWithReferences(entryId),
                acquisitionRepository.findAllWithReferences(entryId));
    }

    /** 사이드바 전체 목록 (Phase 8). 페이징 없음 — 프로젝션 두 컬럼이라 전량이어도 가볍다 */
    public List<BacklogNameResponse> findNames(Long memberId) {
        return backlogEntryRepository.findNames(memberId);
    }

    /**
     * 개발사·유통사 사전 (Phase 8). 오버라이드와 마스터를 합치고 이름순으로 정렬한다.
     * 대소문자만 다른 중복은 남긴다 — 마스터가 준 표기를 임의로 고르면 안 된다
     */
    public CompanyDictionary findCompanies(Long memberId) {
        List<String> devOverrides = backlogEntryRepository.findDeveloperOverrides(memberId);
        List<String> pubOverrides = backlogEntryRepository.findPublisherOverrides(memberId);

        return new CompanyDictionary(
                merge(devOverrides, backlogEntryRepository.findMasterDevelopers(memberId)),
                merge(pubOverrides, backlogEntryRepository.findMasterPublishers(memberId)),
                sorted(devOverrides),
                sorted(pubOverrides));
    }

    private List<String> sorted(List<String> names) {
        return names.stream().distinct().sorted(String.CASE_INSENSITIVE_ORDER).toList();
    }

    private List<String> merge(List<String> overrides, List<String> master) {
        return Stream.concat(overrides.stream(), master.stream())
                .distinct()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
    }

    /** 빈 목록에 IN을 던지면 `in ()`이 되어 DB에 따라 문법 오류다 */
    private Map<Long, String> coverUrlsOf(List<BacklogEntry> entries) {
        List<Long> entryIds = entries.stream().map(BacklogEntry::getId).toList();
        if (entryIds.isEmpty()) {
            return Map.of();
        }

        return coverImageRepository.findByBacklogEntryIdIn(entryIds).stream()
                .collect(Collectors.toMap(
                        cover -> cover.getBacklogEntry().getId(),
                        cover -> fileStorage.publicUrl(cover.getStorageKey()),
                        (first, second) -> first));
    }

    /** 서버는 클라이언트를 믿지 않는다. size=100000이 오면 그대로 실행하지 않는다 */
    private int normalizeSize(int size) {
        return Math.clamp(size, 1, MAX_SIZE);
    }

    private int normalizePage(int page) {
        return Math.max(page, 0);
    }
}
