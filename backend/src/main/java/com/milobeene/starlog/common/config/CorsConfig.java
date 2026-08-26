package com.milobeene.starlog.common.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import com.milobeene.starlog.auth.web.CsrfCookieFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * 크로스 도메인 허용 (N-2). 프론트(3000)와 백엔드(8080)가 다른 오리진이라 이게 없으면
 * 브라우저가 응답을 통째로 버린다.
 *
 * **allowCredentials(true)가 핵심이다.** 세션 쿠키와 CSRF 쿠키가 실려야 하는데,
 * 이걸 켜면 스펙상 `Access-Control-Allow-Origin: *`를 쓸 수 없다 —
 * 그래서 오리진을 와일드카드가 아니라 **명시 목록**으로 준다.
 *
 * 노출 헤더에 Set-Cookie를 넣지 않는 이유 — 쿠키는 브라우저가 알아서 저장한다.
 *
 * **X-XSRF-TOKEN은 노출해야 한다** (O-3). httpOnly=false라 document.cookie로 읽힌다고 했던 건
 * 같은 도메인일 때 얘기다. 배포는 프론트(*.vercel.app)와 백엔드(*.onrender.com)의 도메인이 갈려서
 * JS가 남의 도메인 쿠키를 못 읽는다 — 그래서 토큰을 헤더로도 내려주고, 여기서 그 헤더를 노출한다.
 * CORS는 기본적으로 몇 개의 안전 헤더만 JS에 넘겨주므로 명시하지 않으면 읽을 수 없다
 */
@Configuration
public class CorsConfig {

    /** 배포 때 환경변수로 vercel 도메인을 더한다 (Phase 9 O-3) */
    @Value("${app.cors.allowed-origins:http://localhost:3000}")
    private List<String> allowedOrigins;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();

        config.setAllowedOrigins(allowedOrigins);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "X-Member-Id"));
        config.setAllowCredentials(true);
        config.setExposedHeaders(List.of(CsrfCookieFilter.HEADER));

        // preflight 결과를 1시간 캐시한다. 안 걸면 쓰기 요청마다 OPTIONS가 한 번씩 더 나간다
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        source.registerCorsConfiguration("/oauth2/**", config);
        source.registerCorsConfiguration("/login/**", config);
        return source;
    }
}
