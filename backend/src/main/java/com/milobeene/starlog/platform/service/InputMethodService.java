package com.milobeene.starlog.platform.service;

import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.platform.domain.InputMethod;
import com.milobeene.starlog.platform.repository.InputMethodRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/** 내 입력 방식 (FR-PLT-04). 이름만 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InputMethodService {

    private static final String NOT_FOUND = "입력 방식을 찾을 수 없습니다";

    private final InputMethodRepository inputMethodRepository;
    private final MemberRepository memberRepository;

    /** 추가. 지웠던 이름을 다시 넣으면 되살린다 */
    @Transactional
    public Long register(Long memberId, String name) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
        String normalized = TextValues.require(name, "입력 방식 이름은 비울 수 없습니다");

        Optional<InputMethod> existing =
                inputMethodRepository.findByMemberIdAndName(memberId, normalized);
        if (existing.isPresent()) {
            InputMethod found = existing.get();
            if (!found.isDeleted()) {
                throw new ConflictException("이미 있는 입력 방식입니다: " + normalized);
            }
            found.revive();
            return found.getId();
        }

        InputMethod inputMethod = new InputMethod(member, normalized);
        inputMethodRepository.persist(inputMethod);

        return inputMethod.getId();
    }

    @Transactional
    public void rename(Long memberId, Long inputMethodId, String name) {
        InputMethod inputMethod = findOwnedAlive(memberId, inputMethodId);
        String normalized = TextValues.require(name, "입력 방식 이름은 비울 수 없습니다");

        // 검증을 변경보다 먼저 (원칙 14번)
        inputMethodRepository.findByMemberIdAndName(memberId, normalized)
                .filter(other -> !other.getId().equals(inputMethodId))
                .ifPresent(other -> {
                    throw new ConflictException("이미 있는 입력 방식입니다: " + normalized);
                });

        inputMethod.rename(normalized);
    }

    @Transactional
    public void delete(Long memberId, Long inputMethodId) {
        findOwnedAlive(memberId, inputMethodId).softDelete(LocalDateTime.now());
    }

    public List<InputMethod> findSelectable(Long memberId) {
        return inputMethodRepository.findByMemberIdAndDeletedAtIsNullOrderByNameAsc(memberId);
    }

    /** 회차에 붙일 때. 삭제된 것도 돌려준다 — 과거 회차를 수정할 수 있어야 한다 */
    public InputMethod findOne(Long memberId, Long inputMethodId) {
        return OwnedCatalog.require(inputMethodRepository.findById(inputMethodId),
                memberId, NOT_FOUND + ". id=" + inputMethodId);
    }

    private InputMethod findOwnedAlive(Long memberId, Long inputMethodId) {
        return OwnedCatalog.requireAlive(inputMethodRepository.findById(inputMethodId),
                memberId, NOT_FOUND + ". id=" + inputMethodId);
    }
}
