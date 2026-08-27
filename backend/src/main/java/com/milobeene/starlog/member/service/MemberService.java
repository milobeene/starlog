package com.milobeene.starlog.member.service;

import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberService {

    private final MemberRepository memberRepository;

    /** 프로필 수정 (FR-AUTH-11의 데이터 부분). 가입·인증은 Phase 3 */
    @Transactional
    public void updateProfile(Long memberId, String nickname, String memo, String backgroundColors) {
        Member member = findMember(memberId);
        member.updateProfile(nickname, memo);
        member.changeBackgroundColors(backgroundColors);
    }

    public Member findOne(Long memberId) {
        return findMember(memberId);
    }

    private Member findMember(Long memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
    }
}
