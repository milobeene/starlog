package com.milobeene.starlog.platform.service;

import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.platform.domain.Emulator;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.platform.exception.RevivableAccountException;
import com.milobeene.starlog.platform.repository.PlatformAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlatformAccountService {

    private static final String NOT_FOUND = "플랫폼 계정을 찾을 수 없습니다";

    private final PlatformAccountRepository platformAccountRepository;
    private final PlatformService platformService;
    private final EmulatorService emulatorService;
    private final MemberRepository memberRepository;

    /**
     * 계정 등록 (FR-PLT-01). 같은 플랫폼에 여러 개 등록할 수 있다 (FR-PLT-02) —
     * 유니크가 (member, platform, label)이라 라벨만 다르면 된다.
     *
     * 나머지 선택지 넷과 달리 되살리기를 **조용히 하지 않고 409로 되묻는다** —
     * 계정은 취득 기록(구매 이력)까지 물고 있어서 사용자가 알고 되살리는 편이 낫다 (§7.4)
     */
    /**
     * 계정 등록 (v1.1에서 에뮬레이터도 받는다).
     *
     * ⚠️ **플랫폼과 에뮬 중 하나만** 온다. 둘 다이거나 둘 다 아니면 엔티티가 거절하고,
     * 최종 방어선은 DB의 CHECK다
     */
    @Transactional
    public Long register(Long memberId, Long platformId, Long emulatorId, String accountLabel) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
        if ((platformId == null) == (emulatorId == null)) {
            throw new InvalidInputException("플랫폼이나 에뮬레이터 중 하나만 골라 주세요");
        }

        Platform platform = platformId == null ? null : platformService.findAlive(memberId, platformId);
        Emulator emulator = emulatorId == null ? null : emulatorService.findOne(memberId, emulatorId);

        String label = TextValues.require(accountLabel, "계정 라벨은 비울 수 없습니다");
        String ownerKey = PlatformAccount.ownerKeyOf(platform, emulator);

        Optional<PlatformAccount> existing = platformAccountRepository
                .findByMemberIdAndOwnerKeyAndAccountLabel(memberId, ownerKey, label);
        if (existing.isPresent()) {
            PlatformAccount found = existing.get();
            if (found.isDeleted()) {
                throw new RevivableAccountException(found.getId());
            }
            throw new ConflictException("이미 등록된 계정입니다: " + label);
        }

        PlatformAccount account = platform != null
                ? PlatformAccount.onPlatform(member, platform, label)
                : PlatformAccount.onEmulator(member, emulator, label);
        platformAccountRepository.persist(account);

        return account.getId();
    }

    /** 라벨 변경 (FR-PLT-01). 같은 플랫폼에 같은 라벨이 이미 있으면 예외 */
    @Transactional
    public void rename(Long memberId, Long accountId, String accountLabel) {
        PlatformAccount account = findOwnedAlive(memberId, accountId);
        String label = TextValues.require(accountLabel, "계정 라벨은 비울 수 없습니다");

        platformAccountRepository
                .findByMemberIdAndOwnerKeyAndAccountLabel(memberId, account.getOwnerKey(), label)
                .filter(other -> !other.getId().equals(accountId))
                .ifPresent(other -> {
                    throw new ConflictException("이미 있는 계정 라벨입니다: " + label);
                });

        account.rename(label);
    }

    /** 소프트 삭제 — 회차·취득이 참조하므로 행은 남긴다 (§6.5) */
    @Transactional
    public void delete(Long memberId, Long accountId) {
        findOwnedAlive(memberId, accountId).softDelete(LocalDateTime.now());
    }

    /** 되살리기 (§7.4). 사용자 확인을 받은 뒤 호출된다 */
    @Transactional
    public void revive(Long memberId, Long accountId) {
        findOwned(memberId, accountId).revive();
    }

    /** 회차·취득 입력 시 고를 수 있는 계정. 삭제된 건 빠진다 */
    public List<PlatformAccount> findSelectable(Long memberId) {
        return platformAccountRepository
                .findByMemberIdAndDeletedAtIsNullOrderByAccountLabelAsc(memberId);
    }

    /** 삭제된 것 포함. 과거 기록에 붙은 계정을 보여줄 때 쓴다 */
    public PlatformAccount findOne(Long memberId, Long accountId) {
        return findOwned(memberId, accountId);
    }

    private PlatformAccount findOwnedAlive(Long memberId, Long accountId) {
        return OwnedCatalog.requireAlive(platformAccountRepository.findById(accountId),
                memberId, NOT_FOUND + ". id=" + accountId);
    }

    private PlatformAccount findOwned(Long memberId, Long accountId) {
        return OwnedCatalog.require(platformAccountRepository.findById(accountId),
                memberId, NOT_FOUND + ". id=" + accountId);
    }
}
