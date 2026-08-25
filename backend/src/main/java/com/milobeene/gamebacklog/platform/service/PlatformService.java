package com.milobeene.gamebacklog.platform.service;

import com.milobeene.gamebacklog.common.exception.ConflictException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import com.milobeene.gamebacklog.platform.domain.Platform;
import com.milobeene.gamebacklog.platform.domain.PlatformAccount;
import com.milobeene.gamebacklog.platform.repository.PlatformAccountRepository;
import com.milobeene.gamebacklog.platform.repository.PlatformRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/** 내 플랫폼 (FR-PLT-04). 이름만 있는 선택지 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlatformService {

    private static final String NOT_FOUND = "플랫폼을 찾을 수 없습니다";

    private final PlatformRepository platformRepository;
    private final PlatformAccountRepository platformAccountRepository;
    private final MemberRepository memberRepository;

    /**
     * 추가. **지웠던 이름을 다시 넣으면 되살린다** —
     * 유니크가 (member, name)이라 삭제된 행도 자리를 차지하고 있고,
     * 사용자가 기대하는 것도 "예전 Steam이 돌아오는 것"이다 (과거 기록의 링크가 살아난다)
     */
    @Transactional
    public Long register(Long memberId, String name) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
        String normalized = TextValues.require(name, "플랫폼 이름은 비울 수 없습니다");

        Optional<Platform> existing = platformRepository.findByMemberIdAndName(memberId, normalized);
        if (existing.isPresent()) {
            Platform found = existing.get();
            if (!found.isDeleted()) {
                throw new ConflictException("이미 있는 플랫폼입니다: " + normalized);
            }
            found.revive();
            return found.getId();
        }

        Platform platform = new Platform(member, normalized);
        platformRepository.persist(platform);

        return platform.getId();
    }

    /** 이름 변경. 이 플랫폼을 문 계정·취득이 전부 따라 바뀐다 */
    @Transactional
    public void rename(Long memberId, Long platformId, String name) {
        Platform platform = findOwnedAlive(memberId, platformId);
        String normalized = TextValues.require(name, "플랫폼 이름은 비울 수 없습니다");

        // 검증을 변경보다 먼저 (원칙 14번). 먼저 바꾸면 검증 쿼리의 자동 flush가
        // 내 검증보다 DB 유니크 제약을 먼저 터뜨려 500이 난다
        platformRepository.findByMemberIdAndName(memberId, normalized)
                .filter(other -> !other.getId().equals(platformId))
                .ifPresent(other -> {
                    throw new ConflictException("이미 있는 플랫폼입니다: " + normalized);
                });

        platform.rename(normalized);
    }

    /**
     * 소프트 삭제. **딸린 계정도 함께 닫는다** —
     * 계정은 플랫폼이 있어야 존재할 수 있어서, 플랫폼만 지우면 주인 없는 계정이 선택지에 남는다
     */
    @Transactional
    public void delete(Long memberId, Long platformId) {
        Platform platform = findOwnedAlive(memberId, platformId);
        LocalDateTime now = LocalDateTime.now();

        platformAccountRepository.findByPlatformIdAndDeletedAtIsNull(platformId)
                .forEach(account -> account.softDelete(now));

        platform.softDelete(now);
    }

    public List<Platform> findSelectable(Long memberId) {
        return platformRepository.findByMemberIdAndDeletedAtIsNullOrderByNameAsc(memberId);
    }

    /** 계정을 붙일 때 쓴다. 삭제된 플랫폼에는 새 계정을 못 만든다 */
    public Platform findAlive(Long memberId, Long platformId) {
        return findOwnedAlive(memberId, platformId);
    }

    /** 취득에 붙일 때. 삭제된 것도 돌려준다 — 그 플랫폼에서 샀던 과거 기록을 수정할 수 있어야 한다 */
    public Platform findOne(Long memberId, Long platformId) {
        return OwnedCatalog.require(
                platformRepository.findById(platformId), memberId, NOT_FOUND + ". id=" + platformId);
    }

    private Platform findOwnedAlive(Long memberId, Long platformId) {
        return OwnedCatalog.requireAlive(
                platformRepository.findById(platformId), memberId, NOT_FOUND + ". id=" + platformId);
    }
}
