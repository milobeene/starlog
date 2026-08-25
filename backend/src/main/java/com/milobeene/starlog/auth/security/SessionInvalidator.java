package com.milobeene.starlog.auth.security;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.stereotype.Component;

/**
 * 한 회원의 모든 로그인 세션을 끊는다 (FR-AUTH-05 — 재설정 성공 시 전 세션 무효화).
 *
 * ⚠️ `SessionRegistry`는 **이 JVM의 메모리**다. 인스턴스가 여러 대면 다른 인스턴스의 세션은
 * 못 끊는다. Render 단일 인스턴스 전제라 지금은 성립하고, 다중화하면 Phase 9의
 * Spring Session(JDBC)으로 갈아타야 한다 (NFR-O3).
 */
@Component
@RequiredArgsConstructor
public class SessionInvalidator {

    private final SessionRegistry sessionRegistry;

    public int expireAllSessionsOf(Long memberId) {
        return (int) sessionRegistry.getAllPrincipals().stream()
                .filter(principal -> principal instanceof MemberPrincipal member
                        && memberId.equals(member.getMemberId()))
                // false = 이미 만료 표시된 것도 포함
                .flatMap(principal -> sessionRegistry.getAllSessions(principal, false).stream())
                .peek(SessionInformation::expireNow)
                .count();
    }
}
