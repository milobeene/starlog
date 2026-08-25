package com.milobeene.starlog.platform.service;

import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.platform.domain.Emulator;
import com.milobeene.starlog.platform.repository.EmulatorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/** 내 에뮬레이터 (FR-PLT-04). 이름 + 설정 메모(마크다운) */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EmulatorService {

    private static final String NOT_FOUND = "에뮬레이터를 찾을 수 없습니다";

    private final EmulatorRepository emulatorRepository;
    private final MemberRepository memberRepository;

    /** 추가. 지웠던 이름을 다시 넣으면 되살리고 메모를 새 값으로 덮는다 */
    @Transactional
    public Long register(Long memberId, String name, String memo) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
        String normalized = TextValues.require(name, "에뮬레이터 이름은 비울 수 없습니다");

        Optional<Emulator> existing = emulatorRepository.findByMemberIdAndName(memberId, normalized);
        if (existing.isPresent()) {
            Emulator found = existing.get();
            if (!found.isDeleted()) {
                throw new ConflictException("이미 있는 에뮬레이터입니다: " + normalized);
            }
            found.revive();
            found.update(normalized, memo);
            return found.getId();
        }

        Emulator emulator = new Emulator(member, normalized, memo);
        emulatorRepository.persist(emulator);

        return emulator.getId();
    }

    @Transactional
    public void update(Long memberId, Long emulatorId, String name, String memo) {
        Emulator emulator = findOwnedAlive(memberId, emulatorId);
        String normalized = TextValues.require(name, "에뮬레이터 이름은 비울 수 없습니다");

        // 검증을 변경보다 먼저 (원칙 14번)
        emulatorRepository.findByMemberIdAndName(memberId, normalized)
                .filter(other -> !other.getId().equals(emulatorId))
                .ifPresent(other -> {
                    throw new ConflictException("이미 있는 에뮬레이터입니다: " + normalized);
                });

        emulator.update(normalized, memo);
    }

    @Transactional
    public void delete(Long memberId, Long emulatorId) {
        findOwnedAlive(memberId, emulatorId).softDelete(LocalDateTime.now());
    }

    public List<Emulator> findSelectable(Long memberId) {
        return emulatorRepository.findByMemberIdAndDeletedAtIsNullOrderByNameAsc(memberId);
    }

    /** 회차에 붙일 때. 삭제된 것도 돌려준다 — 과거 회차를 수정할 수 있어야 한다 */
    public Emulator findOne(Long memberId, Long emulatorId) {
        return OwnedCatalog.require(
                emulatorRepository.findById(emulatorId), memberId, NOT_FOUND + ". id=" + emulatorId);
    }

    private Emulator findOwnedAlive(Long memberId, Long emulatorId) {
        return OwnedCatalog.requireAlive(
                emulatorRepository.findById(emulatorId), memberId, NOT_FOUND + ". id=" + emulatorId);
    }
}
