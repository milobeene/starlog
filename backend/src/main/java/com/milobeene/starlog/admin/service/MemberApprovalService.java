package com.milobeene.starlog.admin.service;

import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 가입 승인 (FR-ADM-06).
 *
 * 무료 티어로 배포하는 서비스라 아무나 가입하면 DB·스토리지 용량이 먼저 터진다.
 * 그래서 가입은 열어두되 **관리자가 승인해야 로그인이 된다.**
 *
 * 실제로 막는 곳은 여기가 아니라 로그인 핸들러 두 곳이다 —
 * `LoginResultHandlers`(폼)와 `GoogleOAuth2SuccessHandler`(구글). 둘 다 세션을 안 남기고 끊어서,
 * 미승인 계정은 `/api/**`에 도달할 수 없다(커버 업로드용 presigned URL 발급 포함).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberApprovalService {

    private final MemberRepository memberRepository;

    @Transactional
    public void approve(Long memberId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));

        if (member.isApproved()) {
            throw new ConflictException("이미 승인된 회원입니다: " + member.getEmail());
        }

        member.approve(LocalDateTime.now());
        log.info("가입 승인: memberId={} email={}", memberId, member.getEmail());
    }
}
