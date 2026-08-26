package com.milobeene.starlog.auth.security;

import com.milobeene.starlog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 한 회원의 모든 로그인 세션을 끊는다 (FR-AUTH-05 재설정 시, FR-AUTH-09 탈퇴 시).
 *
 * **O-4에서 구현이 뒤집혔다.** 세션이 DB로 가면서 레지스트리가
 * `SpringSessionBackedSessionRegistry`로 바뀌었는데, 이쪽은 `getAllPrincipals()`를
 * **지원하지 않는다**(UnsupportedOperationException). 전 회원 훑기는 DB 전수 조회라
 * 상류가 일부러 막아둔 것이다. 그래서 "전부 훑어서 내 것만 거르기" → "이름으로 바로 찾기"가 됐다.
 *
 * 그 이름이 무엇인가 — Spring Session은 `Authentication#getName()`을 `principal_name` 컬럼에
 * 색인해두고, 우리 `MemberPrincipal.getUsername()`은 **이메일**이다. 그래서 memberId를 받아
 * 이메일로 바꾸는 조회가 한 방 붙는다. 이메일 변경 기능이 없어 이 키는 흔들리지 않는다 —
 * 나중에 변경 기능이 생기면 **변경 시점에 세션을 끊어야** 옛 이름의 세션이 미아가 되지 않는다.
 *
 * 다중 인스턴스에서도 이제 성립한다. 옛 구현은 이 JVM의 메모리라 다른 인스턴스의 세션을 못 끊었다.
 */
@Component
@RequiredArgsConstructor
public class SessionInvalidator {

    private final SessionRegistry sessionRegistry;
    private final MemberRepository memberRepository;

    public int expireAllSessionsOf(Long memberId) {
        return memberRepository.findById(memberId)
                .map(member -> expireAllSessionsOf(member.getEmail()))
                .orElse(0);
    }

    /** 이메일 = principal 이름. 세션이 하나도 없으면 0이다 */
    public int expireAllSessionsOf(String email) {
        // false = 이미 만료 표시된 것도 포함. 두 번 끊어도 무해하다
        List<SessionInformation> sessions = sessionRegistry.getAllSessions(email, false);

        /*
         * ⚠️ `.stream().peek(...).count()`로 쓰면 안 된다. 자바 9부터 count()는 **크기를 이미 아는**
         * 스트림이면 파이프라인을 실행하지 않고 개수만 돌려준다 — peek이 통째로 건너뛰어져
         * 세션이 하나도 안 끊긴 채 "n건 끊었다"는 값만 나온다. 실제로 그렇게 짰다가 종단 테스트에서 잡혔다.
         * (옛 구현은 앞에 filter·flatMap이 있어 크기를 몰랐고, 그래서 우연히 돌았다)
         */
        sessions.forEach(SessionInformation::expireNow);

        return sessions.size();
    }
}
