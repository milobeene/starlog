package com.milobeene.gamebacklog.auth.service;

import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import com.milobeene.gamebacklog.member.service.MemberService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 가입 = 회원 생성 + 인증 메일 발송. 두 도메인에 걸쳐 있어 여기서 묶는다.
 *
 * 한 트랜잭션이다 — 회원만 만들어지고 토큰이 없는 상태가 생기면
 * 그 계정은 영원히 인증을 못 받는다(재발송으로 구제되긴 하지만 정상 흐름이 아니다).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final MemberService memberService;
    private final MemberRepository memberRepository;
    private final EmailVerificationService emailVerificationService;

    @Transactional
    public Long signUp(String email, String rawPassword, String nickname) {
        Long memberId = memberService.signUp(email, rawPassword, nickname);

        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalStateException("방금 만든 회원을 찾을 수 없습니다"));
        emailVerificationService.issue(member);

        return memberId;
    }
}
