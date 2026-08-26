package com.milobeene.starlog.auth.service;

import com.milobeene.starlog.auth.domain.AuthToken;
import com.milobeene.starlog.auth.domain.TokenPurpose;
import com.milobeene.starlog.auth.repository.AuthTokenRepository;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Locale;

/** 이메일 인증 (FR-AUTH-02) */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EmailVerificationService {

    private static final Duration VALID_FOR = Duration.ofHours(24);
    /** 재발송 최소 간격 (NFR-S9). 메일 발송 한도 소진과 스팸 악용을 막는다 */
    private static final Duration RESEND_INTERVAL = Duration.ofSeconds(60);

    private final AuthTokenRepository authTokenRepository;
    private final MemberRepository memberRepository;
    private final AuthMailSender mailSender;

    /** 가입 직후 발급 */
    @Transactional
    public void issue(Member member) {
        String rawToken = TokenValues.generate();

        authTokenRepository.persist(new AuthToken(
                member,
                TokenPurpose.EMAIL_VERIFICATION,
                TokenValues.hash(rawToken),          // 원문은 저장하지 않는다 (NFR-S2)
                LocalDateTime.now().plus(VALID_FOR)));

        // 메일에는 원문이 실린다. 이 순간 이후로 서버는 원문을 다시 알 수 없다.
        // 커밋 뒤에 보낸다 — 롤백되면 해시가 없어 링크가 죽는다 (AfterCommit 주석 참고)
        String email = member.getEmail();
        AfterCommit.run(() -> mailSender.sendEmailVerification(email, rawToken));
    }

    /**
     * 인증 확인. 실패 사유(없음/만료/이미 씀)를 구분해서 알려주지 않는다 —
     * 토큰을 대입해보는 쪽에 단서를 주지 않기 위해서다.
     */
    @Transactional
    public void verify(String rawToken) {
        LocalDateTime now = LocalDateTime.now();

        AuthToken token = authTokenRepository.findByTokenHash(TokenValues.hash(rawToken))
                .filter(found -> found.isUsable(TokenPurpose.EMAIL_VERIFICATION, now))
                .orElseThrow(() -> new InvalidInputException("유효하지 않은 인증 링크입니다"));

        token.markUsed(now);              // 1회용 — 변경 감지로 반영된다
        token.getMember().verifyEmail();
    }

    /**
     * 재발송. **가입 여부와 무관하게 항상 같은 응답을 낸다** (NFR-S3).
     * 없는 계정이면 아무 일도 하지 않고, 이미 인증됐어도 마찬가지다.
     */
    @Transactional
    public void resend(String email) {
        memberRepository.findByEmail(email.strip().toLowerCase(Locale.ROOT))
                .filter(member -> !member.isEmailVerified())
                .filter(this::notThrottled)
                .ifPresent(this::issue);
    }

    private boolean notThrottled(Member member) {
        return authTokenRepository
                .findFirstByMemberIdAndPurposeOrderByIdDesc(member.getId(), TokenPurpose.EMAIL_VERIFICATION)
                .map(latest -> latest.getCreatedAt().plus(RESEND_INTERVAL).isBefore(LocalDateTime.now()))
                .orElse(true);
    }
}
