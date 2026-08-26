package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
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

    /**
     * 상세 조회용. 살아있는 내 항목 + game을 함께 읽는다.
     * 소유권 위반을 404로 답하는 정책을 이 클래스 밖으로 새지 않게 여기에 둔다
     */
    public BacklogEntry findOwnedWithGame(Long memberId, Long entryId) {
        BacklogEntry entry = backlogEntryRepository.findDetailById(entryId)
                .orElseThrow(() -> new NotFoundException("백로그 항목을 찾을 수 없습니다. id=" + entryId));

        if (!entry.getMember().getId().equals(memberId)) {
            throw new NotFoundException("백로그 항목을 찾을 수 없습니다. id=" + entryId);
        }

        return entry;
    }

    /**
     * findOwned와 같지만 **항목 행을 잠근다.** 형제를 보고 판정하는 검증(회차의 BR-PT-02·03)이
     * 동시 요청에 뚫리지 않게 그 구간을 직렬화한다. 잠금 비용이 있으므로 그런 경로만 쓴다
     */
    public BacklogEntry findOwnedForUpdate(Long memberId, Long entryId) {
        backlogEntryRepository.findByIdForUpdate(entryId)
                .orElseThrow(() -> new NotFoundException("백로그 항목을 찾을 수 없습니다. id=" + entryId));

        return findOwned(memberId, entryId);
    }

    /** 살아있는 내 항목만. 수정 경로는 전부 이걸 쓴다 */
    public BacklogEntry findOwned(Long memberId, Long entryId) {
        BacklogEntry entry = findOwnedIncludingDeleted(memberId, entryId);

        // 삭제된 항목은 수정 대상이 아니다. 되살리기만 삭제된 행을 다룬다
        if (entry.isDeleted()) {
            throw new ConflictException("삭제된 항목입니다. id=" + entryId);
        }

        return entry;
    }

    /**
     * 삭제된 것 포함. entry.getMember()는 LAZY 프록시지만
     * getId()는 프록시가 이미 들고 있는 값이라 SELECT가 나가지 않는다
     */
    public BacklogEntry findOwnedIncludingDeleted(Long memberId, Long entryId) {
        BacklogEntry entry = backlogEntryRepository.findById(entryId)
                .orElseThrow(() -> new NotFoundException("백로그 항목을 찾을 수 없습니다. id=" + entryId));

        // 남의 것도 404다. 403을 주면 "그 id는 존재한다"가 새어나간다 (NFR-S7).
        // 메시지도 위와 같게 유지한다
        if (!entry.getMember().getId().equals(memberId)) {
            throw new NotFoundException("백로그 항목을 찾을 수 없습니다. id=" + entryId);
        }

        return entry;
    }
}
