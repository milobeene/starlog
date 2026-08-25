package com.milobeene.starlog.auth.service;

import com.milobeene.starlog.auth.domain.AuthToken;
import com.milobeene.starlog.auth.domain.TokenPurpose;
import com.milobeene.starlog.auth.repository.AuthTokenRepository;
import com.milobeene.starlog.auth.security.SessionInvalidator;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Locale;

/**
 * 비밀번호 재설정 (FR-AUTH-05).
 *
 * 토큰 구조는 이메일 인증과 같다(랜덤 / 만료 / 1회용 / 해싱 저장). 다른 점은 두 가지다.
 *  - **유효 시간이 짧다** (30분). 계정을 통째로 넘겨주는 열쇠라 노출 창을 좁힌다
 *  - **성공하면 기존 세션을 전부 끊는다.** 비밀번호를 바꾸는 이유가 "누가 내 계정에
 *    들어와 있다"인 경우가 많은데, 세션을 그대로 두면 바꾼 의미가 없다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PasswordResetService {

    private static final Duration VALID_FOR = Duration.ofMinutes(30);
    private static final Duration RESEND_INTERVAL = Duration.ofSeconds(60);

    private final AuthTokenRepository authTokenRepository;
    private final MemberRepository memberRepository;
    private final AuthMailSender mailSender;
    private final PasswordEncoder passwordEncoder;
    private final SessionInvalidator sessionInvalidator;

    /**
     * 재설정 요청. **가입 여부와 무관하게 항상 같은 응답**을 내야 하므로 여기서는 아무것도 던지지 않는다
     * (NFR-S3). 소셜 전용 계정(비밀번호 null)도 대상이다 — 이 경로로 비밀번호를 처음 만들 수 있다.
     */
    @Transactional
    public void request(String email) {
        memberRepository.findByEmail(email.strip().toLowerCase(Locale.ROOT))
                .filter(member -> member.getDeletedAt() == null)
                .filter(this::notThrottled)
                .ifPresent(this::issue);
    }

    @Transactional
    public void reset(String rawToken, String newRawPassword) {
        LocalDateTime now = LocalDateTime.now();

        AuthToken token = authTokenRepository.findByTokenHash(TokenValues.hash(rawToken))
                .filter(found -> found.isUsable(TokenPurpose.PASSWORD_RESET, now))
                .orElseThrow(() -> new InvalidInputException("유효하지 않거나 만료된 링크입니다"));

        Member member = token.getMember();

        /*
         * 재설정은 **잊은 비밀번호를 되찾는 경로지 새로 만드는 경로가 아니다.**
         * 막지 않으면 구글 전용 계정이 여기로 비밀번호를 만들어, 이메일 가입과
         * 비밀번호 설정을 막아둔 것(MemberService)이 무의미해진다.
         * 실제로는 그런 계정에 메일이 안 가서 링크를 못 받지만, 그건 우연한 방어다
         */
        if (!member.hasPassword()) {
            throw new InvalidInputException(
                    "이 계정은 Google 로그인 전용입니다. 비밀번호는 설정하실 수 없습니다");
        }

        member.changePassword(passwordEncoder.encode(newRawPassword));
        token.markUsed(now);

        // 남아 있는 다른 재설정 링크도 함께 죽인다. 하나를 쓰면 나머지는 쓸 이유가 없다
        authTokenRepository.markAllUsed(member.getId(), TokenPurpose.PASSWORD_RESET, now);

        sessionInvalidator.expireAllSessionsOf(member.getId());
    }

    private void issue(Member member) {
        String rawToken = TokenValues.generate();

        authTokenRepository.persist(new AuthToken(
                member,
                TokenPurpose.PASSWORD_RESET,
                TokenValues.hash(rawToken),
                LocalDateTime.now().plus(VALID_FOR)));

        mailSender.sendPasswordReset(member.getEmail(), rawToken);
    }

    private boolean notThrottled(Member member) {
        return authTokenRepository
                .findFirstByMemberIdAndPurposeOrderByIdDesc(member.getId(), TokenPurpose.PASSWORD_RESET)
                .map(latest -> latest.getCreatedAt().plus(RESEND_INTERVAL).isBefore(LocalDateTime.now()))
                .orElse(true);
    }
}
