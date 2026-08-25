package com.milobeene.starlog.member.service;

import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.platform.service.DefaultCatalogSeeder;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final DefaultCatalogSeeder defaultCatalogSeeder;

    /**
     * 이메일 가입을 허용할 주소. **비어 있으면 제한이 없다** (테스트·로컬 기본).
     *
     * `${...:}`는 "없으면 빈 문자열"이라 값을 안 주면 빈 리스트가 된다 —
     * 스프링이 콤마로 끊어 List<String>에 넣어준다
     */
    @Value("${app.signup.email-allowlist:}")
    private List<String> signUpEmailAllowlist = List.of();

    /**
     * 가입 (FR-AUTH-01). 해싱은 서비스의 일이고 엔티티는 이미 인코딩된 값만 받는다.
     *
     * 중복 검사는 **최선 노력**이다. 동시에 같은 이메일로 두 요청이 들어오면 둘 다
     * 이 검사를 통과할 수 있고, 그때는 DB 유니크 제약(uk_member_email)이 잡아
     * DataIntegrityViolationException → 409로 나간다 (설계 원칙 7번)
     */
    @Transactional
    public Long signUp(String email, String rawPassword, String nickname) {
        String normalizedEmail = normalizeEmail(email);
        String normalizedNickname = TextValues.normalize(nickname);

        requireAllowedForEmailSignUp(normalizedEmail);

        if (normalizedNickname == null) {
            throw new InvalidInputException("닉네임은 비울 수 없습니다");
        }
        if (rawPassword == null || rawPassword.isBlank()) {
            throw new InvalidInputException("비밀번호는 비울 수 없습니다");
        }
        if (memberRepository.existsByEmail(normalizedEmail)) {
            throw new ConflictException("이미 가입된 이메일입니다");
        }

        Member member = Member.signUpWithEmail(
                normalizedEmail, passwordEncoder.encode(rawPassword), normalizedNickname);
        memberRepository.persist(member);
        defaultCatalogSeeder.seed(member);   // 기본 플랫폼·입력 방식을 내 것으로 복사

        return member.getId();
    }

    /**
     * 이메일 가입 차단 (OI-02 후속).
     *
     * **인증 메일을 보낼 방법이 없어서 막는다.** 통과시키면 미인증 상태로 남아 로그인이 영영 403이라
     * (I-4) 아무것도 못 하는 계정만 생긴다 — 가입 자체를 거절하는 편이 정직하다.
     * 구글 로그인은 구글이 이메일 소유를 확인해주므로 이 제한과 무관하다.
     *
     * 프론트도 같은 화면을 막지만 여기서 한 번 더 본다 — 서버는 클라이언트를 믿지 않는다
     */
    private void requireAllowedForEmailSignUp(String normalizedEmail) {
        if (signUpEmailAllowlist.isEmpty()) {
            return;
        }
        boolean allowed = signUpEmailAllowlist.stream()
                .map(allowedEmail -> allowedEmail.strip().toLowerCase(Locale.ROOT))
                .anyMatch(normalizedEmail::equals);

        if (!allowed) {
            throw new InvalidInputException(
                    "이메일 가입은 현재 막혀 있습니다. Google 계정으로 로그인해 주세요");
        }
    }

    /** 대소문자만 다른 이메일로 중복 가입되는 것을 막는다. 유니크 제약은 대소문자를 구분한다 */
    private String normalizeEmail(String email) {
        String normalized = TextValues.normalize(email);
        if (normalized == null) {
            throw new InvalidInputException("이메일은 비울 수 없습니다");
        }
        return normalized.toLowerCase(Locale.ROOT);
    }

    /** 프로필 수정 (FR-AUTH-11의 데이터 부분). 가입·인증은 Phase 3 */
    @Transactional
    public void updateProfile(Long memberId, String nickname, String memo) {
        findMember(memberId).updateProfile(nickname, memo);
    }

    /**
     * 비밀번호 변경 (BR-AUTH-01).
     *
     * **비밀번호가 없는 계정(구글 전용)은 새로 만들 수 없다** — 이메일 가입을 막아둔 것과 같은 이유다.
     * 비밀번호를 갖는 순간 이메일 로그인 계정이 되는데, 그 경로는 인증 메일이 필요하고
     * 지금은 메일을 보낼 수 없다. 이메일 가입 제한이 풀리면 여기도 같이 풀린다.
     *
     * 비밀번호가 있는 계정은 현재 값을 반드시 대조한다 — 세션 탈취만으로 비밀번호를
     * 갈아치우고 계정을 통째로 가져가는 경로가 생기면 안 된다
     */
    @Transactional
    public void changePassword(Long memberId, String currentPassword, String newPassword) {
        Member member = findMember(memberId);

        if (!member.hasPassword()) {
            throw new InvalidInputException(
                    "이 계정은 Google 로그인 전용입니다. 비밀번호는 설정하실 수 없습니다");
        }
        if (currentPassword == null
                || !passwordEncoder.matches(currentPassword, member.getPassword())) {
            throw new InvalidInputException("현재 비밀번호가 올바르지 않습니다");
        }

        member.changePassword(passwordEncoder.encode(newPassword));
    }

    public Member findOne(Long memberId) {
        return findMember(memberId);
    }

    private Member findMember(Long memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
    }
}
