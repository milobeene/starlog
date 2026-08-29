package com.milobeene.starlog.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 데스크탑 앱에서 화면과 API가 **다른 오리진**이 됐다 (2026-08-28).
 *
 * ## 왜 갈렸나
 *
 * 예전에는 스프링이 프론트까지 서빙해서 오리진이 하나였다. 대신 창이 입구(`app://`)와
 * 앱(`http://127.0.0.1:포트`)을 **오갈 때마다 문서가 통째로 바뀌었다.** 그래서
 * 검은 화면이 번쩍이고, 배경 연출이 끊기고, 진행 중인 알림이 사라졌다.
 *
 * 이제 창은 **평생 `app://` 한 장**이고 백엔드는 API만 준다. 문서가 안 바뀌니
 * 위의 세 가지가 통째로 없어진다 — 그 대가가 이 파일이다.
 *
 * ## 왜 `desktop` 프로필에만 있나
 *
 * 여기서 열어두면 **로컬 앱의 규칙이 서버에도 새어 나간다**.
 *
 * ⚠️ **와일드카드를 안 쓴다.** 로컬에서만 도는 서버라도 브라우저가 붙을 수 있고,
 * 아무 페이지나 이 API를 부를 수 있게 두면 그 페이지가 내 기록을 통째로 읽는다
 */
@Configuration
@Profile("desktop")
public class DesktopCorsConfig implements WebMvcConfigurer {

    /**
     * 일렉트론이 등록한 커스텀 스킴의 오리진.
     *
     * `protocol.registerSchemesAsPrivileged`에 `standard: true`를 줬기 때문에 호스트 개념이
     * 생겼고, 그래서 오리진이 `app://starlog`라는 온전한 값으로 붙는다
     * (`standard`가 아니면 오리진이 `null`이 되어 이 설정이 통하지 않는다)
     */
    private static final String APP_ORIGIN = "app://starlog";

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(APP_ORIGIN)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                /*
                 * 자격증명은 안 싣는다 — 로그인이 없어서 쿠키도 인증 헤더도 없다.
                 * 켜면 `allowedOrigins`에 와일드카드를 못 쓰게 되는 제약만 따라온다
                 */
                .allowCredentials(false)
                /*
                 * 프리플라이트를 하루 캐시한다. 화면 하나에 API가 여럿 붙는데
                 * 매번 OPTIONS를 왕복하면 로컬이라도 눈에 띄게 굼떠진다
                 */
                .maxAge(86_400);
    }
}
