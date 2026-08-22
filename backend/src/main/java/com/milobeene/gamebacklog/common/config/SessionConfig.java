package com.milobeene.gamebacklog.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.session.HttpSessionEventPublisher;

/**
 * 세션·CSRF 기반 설정.
 *
 * `HttpSessionEventPublisher`가 서블릿 컨테이너의 세션 생성·소멸 이벤트를 스프링으로 흘려주고,
 * `SessionRegistry`가 그걸 받아 "누가 어떤 세션을 갖고 있는지"를 들고 있는다.
 * 이 둘이 없으면 비밀번호 재설정 시 전 세션 무효화(FR-AUTH-05)를 할 방법이 없다.
 */
@Configuration
public class SessionConfig {

    @Bean
    public SessionRegistry sessionRegistry() {
        return new SessionRegistryImpl();
    }

    @Bean
    public HttpSessionEventPublisher httpSessionEventPublisher() {
        return new HttpSessionEventPublisher();
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
