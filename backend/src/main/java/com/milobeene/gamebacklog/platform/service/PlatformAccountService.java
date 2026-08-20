package com.milobeene.gamebacklog.platform.service;

import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import com.milobeene.gamebacklog.platform.domain.Platform;
import com.milobeene.gamebacklog.platform.domain.PlatformAccount;
import com.milobeene.gamebacklog.platform.exception.RevivableAccountException;
import com.milobeene.gamebacklog.platform.repository.PlatformAccountRepository;
import com.milobeene.gamebacklog.platform.repository.PlatformRepository;
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

    private final PlatformAccountRepository platformAccountRepository;
    private final PlatformRepository platformRepository;
    private final MemberRepository memberRepository;

    /**
     * 계정 등록 (FR-PLT-01). 같은 플랫폼에 여러 개 등록할 수 있다 (FR-PLT-02) —
     * 유니크가 (member, platform, label)이라 라벨만 다르면 된다.
     * 삭제된 행도 유니크에 걸리므로 A-5와 같은 3분기가 필요하다 (§7.4)
     */
    @Transactional
    public Long register(Long memberId, Long platformId, String accountLabel) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다. id=" + memberId));
        Platform platform = platformRepository.findById(platformId)
                .orElseThrow(() -> new IllegalArgumentException("플랫폼을 찾을 수 없습니다. id=" + platformId));

        String label = requireLabel(accountLabel);

        Optional<PlatformAccount> existing = platformAccountRepository
                .findByMemberIdAndPlatformIdAndAccountLabel(memberId, platformId, label);
        if (existing.isPresent()) {
            PlatformAccount found = existing.get();
            if (found.isDeleted()) {
                throw new RevivableAccountException(found.getId());
            }
            throw new IllegalStateException("이미 등록된 계정입니다: " + label);
        }

        PlatformAccount account = new PlatformAccount(member, platform, label);
        platformAccountRepository.persist(account);

        return account.getId();
    }

    /** 라벨 변경 (FR-PLT-01). 같은 플랫폼에 같은 라벨이 이미 있으면 예외 */
    @Transactional
    public void rename(Long memberId, Long accountId, String accountLabel) {
        PlatformAccount account = findOwnedAlive(memberId, accountId);
        String label = requireLabel(accountLabel);

        platformAccountRepository
                .findByMemberIdAndPlatformIdAndAccountLabel(
                        memberId, account.getPlatform().getId(), label)
                .filter(other -> !other.getId().equals(accountId))
                .ifPresent(other -> {
                    throw new IllegalStateException("이미 있는 계정 라벨입니다: " + label);
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
        PlatformAccount account = findOwned(memberId, accountId);
        if (account.isDeleted()) {
            throw new IllegalStateException("삭제된 계정입니다. id=" + accountId);
        }
        return account;
    }

    private PlatformAccount findOwned(Long memberId, Long accountId) {
        PlatformAccount account = platformAccountRepository.findById(accountId)
                .orElseThrow(() -> new IllegalArgumentException("플랫폼 계정을 찾을 수 없습니다. id=" + accountId));

        if (!account.getMember().getId().equals(memberId)) {
            throw new IllegalStateException("내 계정이 아닙니다. id=" + accountId);
        }

        return account;
    }

    private String requireLabel(String accountLabel) {
        String normalized = TextValues.normalize(accountLabel);
        if (normalized == null) {
            throw new IllegalArgumentException("계정 라벨은 비울 수 없습니다");
        }
        return normalized;
    }
}
