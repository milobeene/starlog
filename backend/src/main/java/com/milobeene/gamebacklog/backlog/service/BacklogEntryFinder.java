package com.milobeene.gamebacklog.backlog.service;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 소유권·생존 확인. 백로그 자식(회차·취득·태그·장르)을 다루는 서비스가 전부 공유한다.
 * 서비스끼리 주입하면 순환이 생기므로 작은 협력자로 뽑았다
 */
@Component
@RequiredArgsConstructor
public class BacklogEntryFinder {

    private final BacklogEntryRepository backlogEntryRepository;

    /** 살아있는 내 항목만. 수정 경로는 전부 이걸 쓴다 */
    public BacklogEntry findOwned(Long memberId, Long entryId) {
        BacklogEntry entry = findOwnedIncludingDeleted(memberId, entryId);

        // 삭제된 항목은 수정 대상이 아니다. 되살리기만 삭제된 행을 다룬다
        if (entry.isDeleted()) {
            throw new IllegalStateException("삭제된 항목입니다. id=" + entryId);
        }

        return entry;
    }

    /**
     * 삭제된 것 포함. entry.getMember()는 LAZY 프록시지만
     * getId()는 프록시가 이미 들고 있는 값이라 SELECT가 나가지 않는다
     */
    public BacklogEntry findOwnedIncludingDeleted(Long memberId, Long entryId) {
        BacklogEntry entry = backlogEntryRepository.findById(entryId)
                .orElseThrow(() -> new IllegalArgumentException("백로그 항목을 찾을 수 없습니다. id=" + entryId));

        // Phase 3에서 인가로 승격 → 403
        if (!entry.getMember().getId().equals(memberId)) {
            throw new IllegalStateException("내 백로그 항목이 아닙니다. id=" + entryId);
        }

        return entry;
    }
}
