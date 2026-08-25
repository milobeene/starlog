package com.milobeene.gamebacklog.auth.service;

import com.milobeene.gamebacklog.common.exception.ConflictException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import com.milobeene.gamebacklog.platform.service.DefaultCatalogSeeder;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.Optional;

/**
 * 구글 계정 연동 (FR-AUTH-06~08).
 *
 * **자동 연결도 자동 가입도 하지 않는다.** 이메일이 같다고 이어붙이면, 공격자가 남의 이메일로
 * 먼저 가입해둔 뒤 그 사람이 구글 로그인을 하는 순간 계정을 통째로 넘겨받는다 (§6.1 결정 표).
 * 연결은 **이미 로그인한 상태에서만** 가능하다.
 *
 * OAuth2 왕복(리다이렉트·토큰 교환)은 시큐리티 필터가 하고, 여기는 그 결과로 받은
 * `sub` 하나만 다룬다 — 그래야 테스트할 수 있다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GoogleAccountService {

    private static final int NICKNAME_MAX = 30;

    private final MemberRepository memberRepository;
    private final EmailVerificationService emailVerificationService;
    private final DefaultCatalogSeeder defaultCatalogSeeder;

    /** 로그인용 — 연결된 회원 찾기. 없으면 가입시키지 않고 비워서 돌려준다 */
    public Optional<Member> findLinked(String googleSubject) {
        return memberRepository.findByGoogleSubject(googleSubject);
    }

    /**
     * 구글로 가입 (FR-AUTH-12).
     *
     * **이메일이 이미 있으면 이어붙이지 않고 거부한다.** 자동 연결을 허용하면,
     * 공격자가 남의 이메일로 먼저 가입해둔 계정에 진짜 주인이 구글로 들어오는 순간
     * 두 계정이 합쳐진다 (§6.1에서 기각한 안). 탈퇴 유예 중인 이메일도 여기서 걸린다 (BR-AUTH-02).
     */
    @Transactional
    public Member signUp(String googleSubject, String email, boolean emailVerified, String name) {
        String normalized = email.strip().toLowerCase(Locale.ROOT);

        if (memberRepository.existsByEmail(normalized)) {
            throw new ConflictException(
                    "이미 가입된 이메일입니다. 로그인 후 설정에서 구글 계정을 연결해 주세요");
        }

        Member member = Member.signUpWithGoogle(
                normalized, nicknameOf(name, normalized), googleSubject, emailVerified);
        memberRepository.persist(member);
        defaultCatalogSeeder.seed(member);   // 기본 플랫폼·입력 방식을 내 것으로 복사

        if (!emailVerified) {
            // 구글이 소유를 확인 못 해준 경우. 드물지만 Workspace 설정에 따라 있다
            emailVerificationService.issue(member);
        }
        return member;
    }

    /** 구글 이름이 없거나 너무 길 수 있다. 닉네임은 not null · 30자 제한 */
    private String nicknameOf(String name, String email) {
        String candidate = (name == null || name.isBlank())
                ? email.substring(0, email.indexOf('@'))
                : name.strip();
        return candidate.length() <= NICKNAME_MAX ? candidate : candidate.substring(0, NICKNAME_MAX);
    }

    /** 연결 직후 세션을 회원 인증으로 복원할 때 쓴다 (성공 핸들러 전용) */
    @Transactional(readOnly = true)
    public Member findOne(Long memberId) {
        return findMember(memberId);
    }

    @Transactional
    public void link(Long memberId, String googleSubject) {
        memberRepository.findByGoogleSubject(googleSubject)
                .filter(owner -> !owner.getId().equals(memberId))
                .ifPresent(owner -> {
                    throw new ConflictException("이미 다른 계정에 연결된 구글 계정입니다");
                });

        findMember(memberId).linkGoogle(googleSubject);
    }

    @Transactional
    public void unlink(Long memberId) {
        Member member = findMember(memberId);
        if (member.getGoogleSubject() == null) {
            throw new ConflictException("연결된 구글 계정이 없습니다");
        }
        member.unlinkGoogle();   // BR-AUTH-01 검사는 엔티티가 한다
    }

    private Member findMember(Long memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
    }
}
