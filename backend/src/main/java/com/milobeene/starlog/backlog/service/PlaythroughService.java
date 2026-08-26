package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.Playthrough;
import com.milobeene.starlog.backlog.domain.PlaythroughCommand;
import com.milobeene.starlog.backlog.repository.PlaythroughRepository;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.platform.domain.Device;
import com.milobeene.starlog.platform.domain.Emulator;
import com.milobeene.starlog.platform.domain.InputMethod;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.platform.service.DeviceService;
import com.milobeene.starlog.platform.service.EmulatorService;
import com.milobeene.starlog.platform.service.InputMethodService;
import com.milobeene.starlog.platform.service.PlatformAccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlaythroughService {

    private final PlaythroughRepository playthroughRepository;
    private final DeviceService deviceService;
    private final EmulatorService emulatorService;
    private final InputMethodService inputMethodService;
    private final PlatformAccountService platformAccountService;
    private final BacklogEntryFinder entryFinder;

    /** 회차 추가 (FR-PT-01~07). 번호는 1부터 순차, 구멍은 메우지 않는다 */
    @Transactional
    public Long add(Long memberId, Long entryId, PlaythroughCommand command) {
        // 형제를 보고 판정하는 검증이라 항목 행을 잠가 직렬화한다 (BR-PT-02·03)
        BacklogEntry entry = entryFinder.findOwnedForUpdate(memberId, entryId);
        List<Playthrough> siblings = siblingsOf(entryId);

        Playthrough playthrough = Playthrough.of(entry, nextSequenceNo(siblings), command);
        validateAgainstSiblings(playthrough, siblings);
        assignReferences(playthrough, command);

        playthroughRepository.persist(playthrough);

        // 이 한 줄이 없으면 아래 sync가 방금 넣은 회차를 못 본다 (mappedBy 역방향은 읽기 전용)
        entry.addPlaythrough(playthrough);
        entry.syncDerivedState();

        return playthrough.getId();
    }

    /** 회차 수정 (B-5) — 기간·상태·속성 전체 교체 */
    @Transactional
    public void update(Long memberId, Long playthroughId, PlaythroughCommand command) {
        Playthrough playthrough = findOwnedPlaythrough(memberId, playthroughId);
        BacklogEntry entry = playthrough.getBacklogEntry();

        playthrough.update(command);
        validateAgainstSiblings(playthrough, siblingsOf(entry.getId()));
        assignReferences(playthrough, command);

        entry.syncDerivedState();
    }

    /** 회차 물리 삭제 (§7.4 — 회차는 소프트 삭제 대상이 아니다) */
    @Transactional
    public void delete(Long memberId, Long playthroughId) {
        Playthrough playthrough = findOwnedPlaythrough(memberId, playthroughId);
        BacklogEntry entry = playthrough.getBacklogEntry();

        playthroughRepository.delete(playthrough);
        entry.removePlaythrough(playthrough);
        entry.syncDerivedState();
    }

    public List<Playthrough> findAll(Long memberId, Long entryId) {
        entryFinder.findOwned(memberId, entryId);
        return siblingsOf(entryId);
    }

    private List<Playthrough> siblingsOf(Long entryId) {
        return playthroughRepository.findByBacklogEntryIdOrderBySequenceNoAsc(entryId);
    }

    /** 구멍은 메우지 않는다 — 최대값 + 1. 번호는 표시용 라벨이고 최신 판정은 날짜가 한다 (§7.6) */
    private int nextSequenceNo(List<Playthrough> siblings) {
        return siblings.stream()
                .mapToInt(Playthrough::getSequenceNo)
                .max()
                .orElse(0) + 1;
    }

    /** 형제를 봐야 하는 검증 둘. 혼자 판단 가능한 BR-PT-01·04는 엔티티가 이미 했다 */
    private void validateAgainstSiblings(Playthrough target, List<Playthrough> siblings) {
        for (Playthrough sibling : siblings) {
            if (isSame(target, sibling)) {
                continue;   // 수정 중인 자기 자신
            }
            // BR-PT-03 — 판정 기준은 상태가 아니라 종료일이다.
            // 종료일 없는 회차가 둘이면 "지금 하는 중"이 둘이라는 뜻
            if (target.isOngoing() && sibling.isOngoing()) {
                throw new ConflictException(
                        "진행 중인 회차가 이미 있습니다. " + sibling.getSequenceNo()
                                + "회차에 종료일을 적어 닫아주세요");
            }
            // BR-PT-02 — 진행 중 회차는 시작일부터 무한대까지 점유한다
            if (target.overlaps(sibling)) {
                throw new ConflictException(
                        "회차 기간이 " + sibling.getSequenceNo() + "회차와 겹칩니다");
            }
        }
    }

    private boolean isSame(Playthrough target, Playthrough sibling) {
        return target.getId() != null && target.getId().equals(sibling.getId());
    }

    /**
     * 엔티티는 리포지토리를 모르므로 참조 조회는 서비스가 한다.
     *
     * **넷 다 남의 것을 붙일 수 없다.** 예전엔 기기·에뮬이 전역 마스터라 소유권 검사가 없었는데,
     * 회원 소유로 내려오면서 계정과 같은 규칙을 받는다 — 안 막으면 남의 id를 넣어
     * 상세 응답에 그 이름을 실을 수 있다 (NFR-S7).
     *
     * findOne은 **삭제된 것도 돌려준다** — 삭제한 기기로 플레이했던 과거 회차를 수정할 때
     * 실패하면 안 되기 때문이다. 새로 고를 때 삭제된 게 안 보이는 건 findSelectable이 맡는다
     */
    private void assignReferences(Playthrough playthrough, PlaythroughCommand command) {
        Long ownerId = playthrough.getBacklogEntry().getMember().getId();

        Device device = (command.deviceId() == null) ? null
                : deviceService.findOne(ownerId, command.deviceId());

        PlatformAccount account = (command.platformAccountId() == null) ? null
                : platformAccountService.findOne(ownerId, command.platformAccountId());

        Emulator emulator = (command.emulatorId() == null) ? null
                : emulatorService.findOne(ownerId, command.emulatorId());

        InputMethod inputMethod = (command.inputMethodId() == null) ? null
                : inputMethodService.findOne(ownerId, command.inputMethodId());

        playthrough.assignReferences(device, account, emulator, inputMethod);
    }

    private Playthrough findOwnedPlaythrough(Long memberId, Long playthroughId) {
        Playthrough playthrough = playthroughRepository.findById(playthroughId)
                .orElseThrow(() -> new NotFoundException("회차를 찾을 수 없습니다. id=" + playthroughId));

        // 부모 항목의 소유권을 확인한다. 회차는 자기 소유자를 따로 갖지 않는다.
        // 수정도 형제 검증을 타므로 add와 같은 잠금이 필요하다
        entryFinder.findOwnedForUpdate(memberId, playthrough.getBacklogEntry().getId());

        return playthrough;
    }
}
