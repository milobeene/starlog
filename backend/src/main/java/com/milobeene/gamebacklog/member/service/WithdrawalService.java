package com.milobeene.gamebacklog.member.service;

import com.milobeene.gamebacklog.auth.security.SessionInvalidator;
import com.milobeene.gamebacklog.common.exception.ConflictException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * 탈퇴 유예 (FR-AUTH-09, 10).
 *
 * 유예 중에도 **인증은 통과한다.** 막히는 건 인가다 — 로그인은 되지만 권한이
 * ROLE_PENDING_DELETION으로 바뀌어 복구 외에는 아무것도 못 한다.
 * "로그인부터 막으면" 복구 화면으로 유도할 방법이 없어진다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WithdrawalService {

    public static final Duration GRACE_PERIOD = Duration.ofDays(30);

    private final MemberRepository memberRepository;
    private final MemberPurgeService memberPurgeService;
    private final SessionInvalidator sessionInvalidator;

    @Transactional
    public void withdraw(Long memberId) {
        Member member = findMember(memberId);
        if (member.getDeletedAt() != null) {
            throw new ConflictException("이미 탈퇴를 요청한 계정입니다");
        }

        member.withdraw(LocalDateTime.now());

        // 세션에 실린 권한은 로그인 시점에 굳는다. 안 끊으면 유예 상태인데도
        // 기존 탭에서는 ROLE_USER로 계속 돌아다닐 수 있다
        sessionInvalidator.expireAllSessionsOf(memberId);
    }

    @Transactional
    public void restore(Long memberId) {
        Member member = findMember(memberId);
        if (member.getDeletedAt() == null) {
            throw new ConflictException("탈퇴 요청 상태가 아닙니다");
        }

        member.restore();
        sessionInvalidator.expireAllSessionsOf(memberId);   // 권한을 다시 굳히려면 재로그인해야 한다
    }

    /** 유예 만료 배치 (I-8) */
    @Scheduled(cron = "${app.withdrawal.purge-cron}")
    public void purgeExpired() {
        memberPurgeService.purgeExpired(LocalDateTime.now().minus(GRACE_PERIOD));
    }

    private Member findMember(Long memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
    }
}
