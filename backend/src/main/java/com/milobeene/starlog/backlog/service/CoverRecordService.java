package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.CoverImage;
import com.milobeene.starlog.backlog.domain.CoverLocation;
import com.milobeene.starlog.backlog.repository.CoverImageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * 커버 레코드의 DB 쪽 절반 (K-2, K-4).
 *
 * **스토리지 호출이 여기 없는 게 이 클래스의 존재 이유다.** HEAD·Range GET·DELETE는
 * CoverImageService가 트랜잭션 밖에서 하고, 여기는 트랜잭션을 짧게 열었다 닫는다.
 * 합치면 네트워크 왕복 내내 DB 커넥션을 붙잡는다 — GameCacheService와 같은 구조
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CoverRecordService {

    private final BacklogEntryFinder entryFinder;
    private final CoverImageRepository coverImageRepository;

    /** 소유권·생존 확인만. 스토리지를 부르기 전에 남의 항목인지 먼저 걸러낸다 */
    public void requireOwned(Long memberId, Long entryId) {
        entryFinder.findOwned(memberId, entryId);
    }

    public Optional<CoverImage> find(Long memberId, Long entryId) {
        entryFinder.findOwned(memberId, entryId);

        return coverImageRepository.findByBacklogEntryId(entryId);
    }

    /**
     * 커버 확정 (FR-MED-01, FR-MED-03 교체 포함).
     *
     * 이미 있으면 행을 갈아끼우지 않고 값만 바꾼다 — @OneToOne unique 제약 아래에서
     * DELETE + INSERT는 flush 순서에 민감해진다 (JPA 14번과 같은 계열의 함정).
     *
     * @return 스토리지에서 지워야 할 예전 key. 신규면 비어 있다
     */
    @Transactional
    public Optional<CoverImage.Replaced> attach(Long memberId, Long entryId, String storageKey,
                                                String contentType, long sizeBytes,
                                                CoverLocation location) {
        BacklogEntry entry = entryFinder.findOwned(memberId, entryId);

        Optional<CoverImage> existing = coverImageRepository.findByBacklogEntryId(entryId);
        if (existing.isPresent()) {
            return Optional.of(existing.get()
                    .replaceWith(storageKey, contentType, sizeBytes, location));
        }

        coverImageRepository.persist(
                CoverImage.of(entry, storageKey, contentType, sizeBytes, location));

        return Optional.empty();
    }

    /**
     * 커버 삭제 (FR-MED-03).
     *
     * @return 스토리지에서 지워야 할 key. 커버가 없었으면 비어 있다
     */
    @Transactional
    public Optional<CoverImage.Replaced> detach(Long memberId, Long entryId) {
        entryFinder.findOwned(memberId, entryId);

        return coverImageRepository.findByBacklogEntryId(entryId)
                .map(cover -> {
                    // 행이 사라지기 전에 위치까지 챙긴다 — key만으로는 어디서 지울지 모른다
                    CoverImage.Replaced target =
                            new CoverImage.Replaced(cover.getStorageKey(), cover.getLocation());
                    coverImageRepository.delete(cover);
                    return target;
                });
    }
}
