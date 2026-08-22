package com.milobeene.gamebacklog.member.service;

import com.milobeene.gamebacklog.common.exception.ConflictException;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;

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
        return member.getId();
    }

    /** 대소문자만 다른 이메일로 중복 가입되는 것을 막는다. 유니크 제약은 대소문자를 구분한다 */
    private String normalizeEmail(String email) {
        String normalized = TextValues.normalize(email);
        if (normalized == null) {
            throw new InvalidInputException("이메일은 비울 수 없습니다");
        }
        return normalized.toLowerCase(java.util.Locale.ROOT);
    }

    /** 프로필 수정 (FR-AUTH-11의 데이터 부분). 가입·인증은 Phase 3 */
    @Transactional
    public void updateProfile(Long memberId, String nickname, String memo) {
        findMember(memberId).updateProfile(nickname, memo);
    }

    public Member findOne(Long memberId) {
        return findMember(memberId);
    }

    private Member findMember(Long memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
    }
}
