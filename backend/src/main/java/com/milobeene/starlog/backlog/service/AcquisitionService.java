package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.backlog.domain.Acquisition;
import com.milobeene.starlog.backlog.domain.AcquisitionCommand;
import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.repository.AcquisitionRepository;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.platform.service.PlatformAccountService;
import com.milobeene.starlog.platform.service.PlatformService;
import com.milobeene.starlog.subscription.service.SubscriptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AcquisitionService {

    private final AcquisitionRepository acquisitionRepository;
    private final PlatformService platformService;
    private final PlatformAccountService platformAccountService;
    private final BacklogEntryFinder entryFinder;
    private final SubscriptionService subscriptionService;

    /**
     * 취득 추가 (FR-ACQ-01~03, 06).
     * 형제 검증이 없는 이유 — 복수 취득이 정상이다. 재구매도 DLC도 별도 행이다
     */
    @Transactional
    public Long add(Long memberId, Long entryId, AcquisitionCommand command) {
        BacklogEntry entry = entryFinder.findOwned(memberId, entryId);

        Acquisition acquisition = Acquisition.of(entry, command);
        assignReferences(acquisition, command);

        acquisitionRepository.persist(acquisition);

        // 회차 때와 같은 함정. persist만으로는 부모의 역방향 컬렉션에 안 들어간다
        entry.addAcquisition(acquisition);
        entry.syncDerivedState();

        return acquisition.getId();
    }

    /** 취득 수정 (C-4) — 전체 교체 */
    @Transactional
    public void update(Long memberId, Long acquisitionId, AcquisitionCommand command) {
        Acquisition acquisition = findOwnedAcquisition(memberId, acquisitionId);

        acquisition.update(command);
        assignReferences(acquisition, command);

        // NOT_OWNED로 바꾸면 상태가 BACKLOG → WISHLIST로 되돌아갈 수 있다
        acquisition.getBacklogEntry().syncDerivedState();
    }

    /** 취득 물리 삭제 (§7.4 — 취득은 소프트 삭제 대상이 아니다) */
    @Transactional
    public void delete(Long memberId, Long acquisitionId) {
        Acquisition acquisition = findOwnedAcquisition(memberId, acquisitionId);
        BacklogEntry entry = acquisition.getBacklogEntry();

        acquisitionRepository.delete(acquisition);
        entry.removeAcquisition(acquisition);
        entry.syncDerivedState();
    }

    public List<Acquisition> findAll(Long memberId, Long entryId) {
        entryFinder.findOwned(memberId, entryId);
        return acquisitionRepository.findByBacklogEntryIdOrderByIdAsc(entryId);
    }

    /** 엔티티는 리포지토리를 모르므로 참조 조회는 서비스가 한다 */
    private void assignReferences(Acquisition acquisition, AcquisitionCommand command) {
        // 남의 것은 붙일 수 없다 (PlaythroughService와 같은 이유. v0.2의 보류를 해제했다)
        Long ownerId = acquisition.getBacklogEntry().getMember().getId();

        Platform platform = (command.platformId() == null) ? null
                : platformService.findOne(ownerId, command.platformId());

        PlatformAccount account = (command.platformAccountId() == null) ? null
                : platformAccountService.findOne(ownerId, command.platformAccountId());

        acquisition.assignReferences(platform, account);

        // 남의 구독은 연결할 수 없다. findOwned가 소유권을 확인한다
        acquisition.assignSubscription(
                (command.subscriptionId() == null) ? null
                        : subscriptionService.findOwned(
                        acquisition.getBacklogEntry().getMember().getId(), command.subscriptionId()));
    }

    private Acquisition findOwnedAcquisition(Long memberId, Long acquisitionId) {
        Acquisition acquisition = acquisitionRepository.findById(acquisitionId)
                .orElseThrow(() -> new NotFoundException("취득 기록을 찾을 수 없습니다. id=" + acquisitionId));

        // 부모 항목의 소유권을 확인한다. 취득은 자기 소유자를 따로 갖지 않는다
        entryFinder.findOwned(memberId, acquisition.getBacklogEntry().getId());

        return acquisition;
    }
}
