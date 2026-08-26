package com.milobeene.starlog.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.session.security.SpringSessionBackedSessionRegistry;

/**
 * 세션·CSRF 기반 설정.
 *
 * **O-4에서 세션 저장소가 메모리 → DB로 바뀌었다.** Render 무료는 15분 무활동이면 JVM이 죽는데,
 * 세션이 메모리면 깰 때마다 전원 로그아웃이라 앱이 못 쓸 물건이 된다.
 *
 * 그래서 `SessionRegistry`도 같이 갈아끼운다. 옛 `SessionRegistryImpl`은 **JVM 메모리 맵**이고
 * 서블릿 컨테이너의 세션 이벤트(`HttpSessionEventPublisher`)로 채워졌다 —
 * 세션이 DB로 가면 그 이벤트가 안 오므로 레지스트리가 **영구히 비어 있게 되고**,
 * 전 세션 무효화(FR-AUTH-05·09)가 예외도 없이 조용히 0건이 된다. 그래서 `HttpSessionEventPublisher`도
 * 함께 걷어냈다 — 남겨두면 "채워지고 있다"는 착시만 준다.
 */
@Configuration
public class SessionConfig {

    /**
     * DB에 저장된 세션을 들여다보는 레지스트리.
     *
     * ⚠️ **`getAllPrincipals()`를 지원하지 않는다** — 부르면 UnsupportedOperationException이다.
     * 전 회원을 훑는 건 DB 전수 조회라 상류가 일부러 막았다. 대신 principal 이름으로 찾는
     * `getAllSessions(name, ...)`만 쓴다 (SessionInvalidator 참고)
     */
    @Bean
    public <S extends Session> SessionRegistry sessionRegistry(
            FindByIndexNameSessionRepository<S> sessionRepository) {
        return new SpringSessionBackedSessionRegistry<>(sessionRepository);
    }

    /**
     * CSRF 토큰 저장소.
     *
     * SecurityConfig가 아니라 여기 있는 이유 — SecurityConfig는 CsrfTokenIssuer를 주입받고,
     * 그 Issuer는 이 저장소를 주입받는다. 같은 클래스에 두면 순환 참조로 기동이 실패한다.
     */
    @Bean
    public CsrfTokenRepository csrfTokenRepository() {
        return CookieCsrfTokenRepository.withHttpOnlyFalse();
    }
}
