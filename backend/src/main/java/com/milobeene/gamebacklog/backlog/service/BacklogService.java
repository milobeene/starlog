package com.milobeene.gamebacklog.backlog.service;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.domain.OverrideCommand;
import com.milobeene.gamebacklog.backlog.exception.RevivableEntryException;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryRepository;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BacklogService {

    private final BacklogEntryRepository backlogEntryRepository;
    private final MemberRepository memberRepository;
    private final GameRepository gameRepository;
    private final BacklogEntryFinder entryFinder;

    /** 게임을 내 백로그에 담는다 (FR-BL-01) */
    @Transactional
    public Long addToBacklog(Long memberId, Long gameId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다. id=" + memberId));

        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new IllegalArgumentException("게임을 찾을 수 없습니다. id=" + gameId));

        // §7.4 3분기. 앱 레벨 검증은 최선 노력이고 진짜 방어선은 DB 유니크 제약
        Optional<BacklogEntry> existing =
                backlogEntryRepository.findByMemberIdAndGameIdIncludingDeleted(memberId, gameId);
        if (existing.isPresent()) {
            BacklogEntry found = existing.get();
            if (found.isDeleted()) {
                throw new RevivableEntryException(found.getId());   // 확인 후 revive()로
            }
            throw new IllegalStateException("이미 담은 게임입니다. gameId=" + gameId);
        }

        BacklogEntry entry = BacklogEntry.of(member, game);
        backlogEntryRepository.persist(entry);

        return entry.getId();
    }

    /**
     * 개인 기록 수정 (FR-BL-05, 06, 07) — 전체 교체. null을 넘긴 값은 지워진다.
     * save() 호출 없음. 영속 상태 엔티티라 커밋 시점에 변경 감지로 UPDATE가 나간다.
     */
    @Transactional
    public void updatePersonalRecord(Long memberId, Long entryId,
                                     BigDecimal rating, Integer playTimeHours, String memo) {
        BacklogEntry entry = entryFinder.findOwned(memberId, entryId);

        entry.updatePersonalRecord(rating, playTimeHours, memo);
    }

    /**
     * 개인 오버라이드 수정·삭제 (FR-BL-03, 04) — 전체 교체.
     * 빈 값을 넘기면 오버라이드가 지워지고 마스터 값이 다시 표시된다.
     */
    @Transactional
    public void updateOverrides(Long memberId, Long entryId, OverrideCommand command) {
        BacklogEntry entry = entryFinder.findOwned(memberId, entryId);

        entry.updateOverrides(command);
    }

    /** 단건 조회 (A-6). 삭제된 항목은 없는 것으로 취급한다 */
    public BacklogEntry findOne(Long memberId, Long entryId) {
        return entryFinder.findOwned(memberId, entryId);
    }

    /**
     * 내 백로그 목록 (FR-QRY-05 기초).
     * 엔티티를 그대로 돌려주는 건 Phase 1 한정 — H-1에서 DTO로 감싼다.
     * open-in-view: false이므로 이 반환값의 LAZY 필드를 트랜잭션 밖에서 건드리면 터진다
     */
    public List<BacklogEntry> findAll(Long memberId) {
        return backlogEntryRepository.findByMemberIdAndDeletedAtIsNullOrderByDisplayNameAsc(memberId);
    }

    /** 백로그 항목 소프트 삭제 (FR-BL-08) */
    @Transactional
    public void delete(Long memberId, Long entryId) {
        BacklogEntry entry = entryFinder.findOwned(memberId, entryId);

        entry.softDelete(LocalDateTime.now());
    }

    /** 삭제된 항목 되살리기 (§7.4). 사용자 확인을 받은 뒤 호출된다 */
    @Transactional
    public void revive(Long memberId, Long entryId) {
        BacklogEntry entry = entryFinder.findOwnedIncludingDeleted(memberId, entryId);

        entry.revive();
    }
}