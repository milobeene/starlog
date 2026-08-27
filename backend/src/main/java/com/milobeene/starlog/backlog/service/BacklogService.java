package com.milobeene.starlog.backlog.service;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.OverrideCommand;
import com.milobeene.starlog.backlog.exception.RevivableEntryException;
import com.milobeene.starlog.backlog.domain.CoverImage;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.backlog.repository.CoverImageRepository;
import com.milobeene.starlog.common.util.AfterCommit;
import com.milobeene.starlog.common.storage.FileStoragePort;
import jakarta.persistence.EntityManager;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
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
    /* 완전 삭제 전용. 삭제 순서가 전부인 작업이라 리포지토리 넷 대신 EntityManager를 직접 쓴다
       (MemberPurgeService와 같은 이유 — 순서가 한 곳에서 읽혀야 한다) */
    private final CoverImageRepository coverImageRepository;
    private final FileStoragePort fileStorage;
    private final EntityManager em;

    /** 게임을 내 백로그에 담는다 (FR-BL-01) */
    @Transactional
    public Long addToBacklog(Long memberId, Long gameId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));

        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new NotFoundException("게임을 찾을 수 없습니다. id=" + gameId));

        // §7.4 3분기. 앱 레벨 검증은 최선 노력이고 진짜 방어선은 DB 유니크 제약
        Optional<BacklogEntry> existing =
                backlogEntryRepository.findByMemberIdAndGameIdIncludingDeleted(memberId, gameId);
        if (existing.isPresent()) {
            BacklogEntry found = existing.get();
            if (found.isDeleted()) {
                throw new RevivableEntryException(found.getId());   // 확인 후 revive()로
            }
            throw new ConflictException("이미 담은 게임입니다. gameId=" + gameId);
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
                                     BigDecimal rating, BigDecimal playTimeHours, String memo) {
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

    /** 단건 조회 (A-6) */
    public BacklogEntry findOne(Long memberId, Long entryId) {
        // 조회에서 삭제된 항목은 "없는 것"이다 — 존재를 노출하지 않는다.
        // 수정 경로(findOwned)의 "삭제된 항목입니다"와 의도적으로 다르다
        BacklogEntry entry = backlogEntryRepository.findByIdAndDeletedAtIsNull(entryId)
                .orElseThrow(() -> new NotFoundException("백로그 항목을 찾을 수 없습니다. id=" + entryId));

        if (!entry.getMember().getId().equals(memberId)) {
            throw new NotFoundException("백로그 항목을 찾을 수 없습니다. id=" + entryId);
        }

        return entry;
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

    /**
     * **완전 삭제** (§7.4). 되돌릴 수 없다.
     *
     * **이미 소프트 삭제된 것만 지운다** — 살아 있는 게임이 한 방에 사라지는 경로를 만들지
     * 않는다. 휴지통을 한 번 거쳐야 한다.
     *
     * 삭제 순서가 전부다. `BacklogEntry ↔ Playthrough`는 서로를 참조하므로
     * (lastPlaythrough 비정규화, §7.2) **항목의 참조를 먼저 끊어야** 회차를 지울 수 있다.
     * MemberPurgeService의 DELETE_ORDER와 같은 규칙을 항목 하나짜리로 좁힌 것이다.
     *
     * 커버 파일은 반환만 하고 지우지 않는다 — 컨트롤러가 커밋 뒤에 지운다.
     * DB 커밋 전에 파일부터 지우면 롤백 시 "DB엔 있는데 파일이 없는" 최악이 나온다 (K-4)
     */
    @Transactional
    public void purge(Long memberId, Long entryId) {
        BacklogEntry entry = entryFinder.findOwnedIncludingDeleted(memberId, entryId);
        if (!entry.isDeleted()) {
            throw new ConflictException("삭제된 항목만 완전히 지울 수 있습니다. id=" + entryId);
        }

        // 행이 사라지기 전에 스토리지 key를 챙긴다 — 지운 뒤엔 어떤 파일이었는지 알 길이 없다
        String coverKey = coverImageRepository.findByBacklogEntryId(entryId)
                .map(CoverImage::getStorageKey)
                .orElse(null);

        // 순환 참조를 먼저 끊는다. 이걸 안 하면 회차 삭제가 FK에 걸린다
        entry.detachLastPlaythrough();
        em.flush();

        em.createQuery("delete from BacklogEntryGenre x where x.backlogEntry.id = :id")
                .setParameter("id", entryId).executeUpdate();
        em.createQuery("delete from CoverImage x where x.backlogEntry.id = :id")
                .setParameter("id", entryId).executeUpdate();
        em.createQuery("delete from Acquisition x where x.backlogEntry.id = :id")
                .setParameter("id", entryId).executeUpdate();
        em.createQuery("delete from Playthrough x where x.backlogEntry.id = :id")
                .setParameter("id", entryId).executeUpdate();

        /*
         * 벌크 삭제는 영속성 컨텍스트를 우회한다 — 방금 지운 자식들이 컨텍스트에 그대로 남아
         * 부모를 지울 때 다시 flush되면 이미 없는 행을 건드린다. 비우고 나서 부모를 지운다
         */
        em.clear();
        em.createQuery("delete from BacklogEntry b where b.id = :id")
                .setParameter("id", entryId).executeUpdate();

        if (coverKey != null) {
            // 커밋 뒤에 지운다 — 실패는 삼킨다. 최악이 고아 파일이고 그건 감수한다 (K-4)
            AfterCommit.run(() -> fileStorage.delete(coverKey));
        }
    }
}