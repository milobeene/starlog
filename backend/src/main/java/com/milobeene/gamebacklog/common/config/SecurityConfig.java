package com.milobeene.gamebacklog.common.config;

import com.milobeene.gamebacklog.auth.web.CsrfCookieFilter;
import com.milobeene.gamebacklog.auth.web.DevHeaderAuthenticationFilter;
import com.milobeene.gamebacklog.auth.web.LoginResultHandlers;
import com.milobeene.gamebacklog.auth.web.RestAccessDeniedHandler;
import com.milobeene.gamebacklog.auth.web.RestAuthenticationEntryPoint;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfigurationSource;
import com.milobeene.gamebacklog.auth.web.CsrfTokenIssuer;
import com.milobeene.gamebacklog.auth.web.GoogleLinkSessionFilter;
import com.milobeene.gamebacklog.auth.web.GoogleOAuth2FailureHandler;
import com.milobeene.gamebacklog.auth.web.GoogleOAuth2SuccessHandler;
import com.milobeene.gamebacklog.auth.web.JsonErrors;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

/**
 * 시큐리티 필터 체인 설계도.
 *
 * `SecurityFilterChain` 빈이 컨테이너에 **하나라도 있으면** 부트는 기본 체인을 만들지 않는다.
 * 그래서 이 파일 하나가 곧 필터 체인 전체 정의가 된다.
 *
 * I-4(미인증 로그인 차단)는 LoginResultHandlers, I-7(유예 인가 제한)은 ROLE_PENDING_DELETION,
 * I-9(관리자)는 아래 /api/admin/** 규칙으로 전부 구현됐다.
 *
 * 남은 것:
 *   - P9   크로스 도메인 배포 시 CSRF·SameSite 재검토, /h2-console 노출 확인
 */
@Configuration
@RequiredArgsConstructor
public class SecurityConfig {

    private final RestAuthenticationEntryPoint authenticationEntryPoint;
    private final RestAccessDeniedHandler accessDeniedHandler;
    private final LoginResultHandlers loginResultHandlers;

    /**
     * ObjectProvider — 빈이 **없을 수도 있는** 의존성을 받는 방법.
     * dev 헤더 필터는 prod 프로필에 존재하지 않으므로 그냥 주입받으면 기동이 실패한다.
     */
    private final ObjectProvider<DevHeaderAuthenticationFilter> devHeaderFilter;
    private final SessionRegistry sessionRegistry;
    private final CsrfTokenRepository csrfTokenRepository;
    private final CsrfTokenIssuer csrfTokenIssuer;
    private final GoogleOAuth2SuccessHandler googleOAuth2SuccessHandler;
    private final GoogleOAuth2FailureHandler googleOAuth2FailureHandler;

    /**
     * 구글 설정(환경변수)이 없으면 이 빈이 아예 안 만들어진다 → 구글 로그인 없이 그대로 뜬다.
     * 자격증명 없이도 로컬·CI가 돌아야 하므로 필수 의존으로 두지 않는다
     */
    private final ObjectProvider<ClientRegistrationRepository> clientRegistrations;

    private final CorsConfigurationSource corsConfigurationSource;

    /** 인증 없이 열어두는 경로. 로그인 자체를 막으면 로그인할 방법이 없다 */
    private static final String[] PUBLIC_PATHS = {
            "/api/auth/signup",
            "/api/auth/login",
            // 인증 메일 링크는 로그인 전에 눌린다. 토큰 자체가 신분증 역할을 한다
            "/api/auth/email-verification",
            "/api/auth/email-verification/resend",
            "/api/auth/password-reset",
            "/api/auth/password-reset/request",
            "/h2-console/**"      // dev에서만 켜진다(spring.h2.console.enabled). Phase 9에서 재확인
    };

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                /*
                 * CORS를 시큐리티 체인 안에서 켠다 (N-2). WebMvcConfigurer의 addCorsMappings로는
                 * 부족하다 — 그건 MVC 핸들러 단계라 시큐리티 필터가 먼저 401로 끊어버리면
                 * CORS 헤더가 안 붙고, 브라우저에는 네트워크 오류로만 보인다.
                 *
                 * preflight(OPTIONS)는 쿠키를 안 싣고 오므로 인증 대상에서 빼야 한다
                 */
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(org.springframework.http.HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(PUBLIC_PATHS).permitAll()
                        // 탈퇴 유예 중에는 복구만 가능하다 (FR-AUTH-10)
                        .requestMatchers("/api/me/restore").hasRole("PENDING_DELETION")
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // 유예 중 계정은 ROLE_USER가 아니라 ROLE_PENDING_DELETION이라 여기서 걸린다
                        .requestMatchers("/api/**").hasAnyRole("USER", "ADMIN")
                        .anyRequest().authenticated())

                /*
                 * 폼 로그인이라 컨트롤러 메서드가 없다. loginProcessingUrl 경로로 오는 요청을
                 * UsernamePasswordAuthenticationFilter가 가로채 처리한다.
                 * 본문은 JSON이 아니라 form 형식(email=...&password=...)이다.
                 */
                .formLogin(form -> form
                        .loginProcessingUrl("/api/auth/login")
                        .usernameParameter("email")
                        .passwordParameter("password")
                        .successHandler(loginResultHandlers.success())
                        .failureHandler(loginResultHandlers.failure()))

                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .logoutSuccessHandler(loginResultHandlers.logoutSuccess())
                        .invalidateHttpSession(true)
                        .deleteCookies("JSESSIONID"))

                /*
                 * CSRF (OI-14, 로컬 기준 결론) — 세션 쿠키는 브라우저가 자동으로 실어 보내므로
                 * 다른 사이트가 우리 API로 POST를 유도할 수 있다. 토큰을 쿠키로 내려주고
                 * 요청 헤더(X-XSRF-TOKEN)로 되받아 대조한다. httpOnly=false여야 JS가 읽는다.
                 * 크로스 도메인 배포(SameSite=None) 재검토는 Phase 9.
                 */
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokenRepository)
                        // 기본 핸들러는 BREACH 대응으로 토큰을 매 요청 다르게 인코딩한다.
                        // 쿠키 값을 그대로 헤더에 넣는 SPA 방식과 안 맞아서 평문 핸들러로 바꾼다
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                        .ignoringRequestMatchers("/h2-console/**"))

                // 인증 실패 401 / 인가 실패 403을 JSON으로 통일한다. 302 리다이렉트 금지
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))

                // 기본값 DENY는 H2 콘솔(iframe 구조)을 빈 화면으로 만든다
                .headers(headers -> headers.frameOptions(frame -> frame.sameOrigin()))

                /*
                 * 세션을 레지스트리에 등록시키려는 설정이다. 동시 로그인 수는 제한하지 않는다(-1).
                 * 등록이 돼 있어야 "이 회원의 모든 세션"을 찾아 끊을 수 있다 (FR-AUTH-05).
                 * 만료된 세션으로 들어오면 302가 아니라 401 JSON으로 답한다
                 */
                .sessionManagement(session -> session
                        .maximumSessions(-1)
                        .sessionRegistry(sessionRegistry)
                        .expiredSessionStrategy(event -> {
                            // 세션을 끊으면 CSRF 쿠키도 같이 지워진다 → 새로 내려줘야 재로그인이 된다
                            csrfTokenIssuer.issueFresh(event.getRequest(), event.getResponse());
                            JsonErrors.write(event.getResponse(), 401,
                                    "SESSION_EXPIRED", "세션이 만료되었습니다");
                        }))

                .httpBasic(basic -> basic.disable());

        /*
         * 구글 연동 (FR-AUTH-06~08). 자격증명이 있을 때만 체인에 붙는다.
         * 연결/로그인 분기는 성공 핸들러가 한다 — 자동 가입은 하지 않는다
         */
        if (clientRegistrations.getIfAvailable() != null) {
            http.oauth2Login(oauth -> oauth
                    .successHandler(googleOAuth2SuccessHandler)
                    .failureHandler(googleOAuth2FailureHandler));
            // 떠나기 전에 "누가 연결을 시작했는지"를 세션에 남긴다
            /*
             * **OAuth2AuthorizationRequestRedirectFilter보다 앞이어야 한다.**
             * 그 필터가 /oauth2/authorization/google에서 곧바로 구글로 리다이렉트하고 체인을 끝내므로,
             * AuthorizationFilter 앞에 두면 우리 필터는 아예 실행되지 않는다.
             * 그러면 "누가 연결을 시작했는지"가 세션에 안 남아 연결이 로그인/가입으로 처리된다
             */
            http.addFilterBefore(new GoogleLinkSessionFilter(),
                    OAuth2AuthorizationRequestRedirectFilter.class);
        }

        // 토큰을 강제로 만들어 쿠키로 내린다. CsrfFilter 바로 뒤여야 토큰 속성이 이미 실려 있다
        http.addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class);

        // dev·test에서만 체인에 끼어든다. 인가 판정(AuthorizationFilter) 직전이어야 효과가 있다
        devHeaderFilter.ifAvailable(filter -> http.addFilterBefore(filter, AuthorizationFilter.class));

        return http.build();
    }

    /**
     * OI-03 결정: BCrypt.
     *
     * 팩토리가 주는 것은 BCryptPasswordEncoder가 아니라 **DelegatingPasswordEncoder**다.
     * 저장할 때 `{bcrypt}` 접두어를 붙이고, 검증할 때 그 접두어를 보고 맞는 인코더에 넘긴다.
     * 덕분에 나중에 알고리즘을 바꿔도 기존 해시를 그대로 검증할 수 있다 (NFR-S1).
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
