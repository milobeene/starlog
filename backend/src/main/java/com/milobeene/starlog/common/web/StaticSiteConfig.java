package com.milobeene.starlog.common.web;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * 프론트 정적 파일 서빙 (v1.0 데스크탑).
 *
 * **왜 스프링이 프론트까지 서빙하나** — 일렉트론 앱에서 프론트와 API가 같은 오리진이 되면
 * CORS·쿠키·포트 주입 문제가 통째로 사라진다. 백엔드 포트를 실행 시점에 고르는데
 * 프론트는 빌드 시점에 그 포트를 알 수 없기 때문에, 애초에 몰라도 되게 만드는 쪽을 택했다
 * (상대 경로만 쓰면 된다). → docs/v1.0-architecture.md §2
 *
 * ## Next 정적 내보내기의 파일 모양
 *
 * `output: "export"`는 라우트마다 HTML을 하나씩 떨군다:
 * `/dashboard` → `dashboard.html`, `/library/detail` → `library/detail.html`.
 * 브라우저는 확장자 없이 `/dashboard`로 요청하므로 **`.html`을 붙여 다시 찾는 단계**가 필요하다.
 *
 * ## SPA 폴백을 하지 않는 이유
 *
 * 흔한 방법은 모르는 경로를 전부 `index.html`로 넘기는 것인데, App Router 정적 내보내기에서는
 * 그러면 안 된다. `index.html`은 **루트 라우트의 결과물**이라, 그걸로 `/dashboard`를 열면
 * 클라이언트 라우터가 `/`에서 시작한다. 라우트마다 제 HTML을 줘야 한다.
 * 진짜 없는 경로는 `404.html`로 보낸다.
 *
 * ## /api/** 를 가리지 않는다
 *
 * `RequestMappingHandlerMapping`(@RestController)이 리소스 핸들러보다 먼저 본다.
 * 컨트롤러가 처리하는 경로는 여기까지 내려오지 않는다.
 *
 * 정적 파일이 없으면(웹 개발 중) 이 설정은 아무 일도 하지 않는다 — 그냥 404다.
 */
@Slf4j
@Configuration
public class StaticSiteConfig implements WebMvcConfigurer {

    private static final String LOCATION = "classpath:/static/";

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations(LOCATION)
                .resourceChain(true)
                .addResolver(new HtmlExtensionResolver());
    }

    /**
     * 순서대로 시도한다: 있는 그대로 → `.html` 붙여서 → `/index.html` 붙여서 → 404.html.
     *
     * `_next/` 아래 해시 붙은 에셋은 첫 단계에서 끝난다. 화면 경로만 두 번째로 내려온다
     */
    private static class HtmlExtensionResolver extends PathResourceResolver {

        @Override
        protected Resource getResource(String path, Resource location) throws IOException {
            Resource asIs = super.getResource(path, location);
            if (asIs != null) {
                return asIs;
            }
            // 에셋 요청이 404일 때 HTML을 돌려주면 화면이 깨진 채로 뜬다. 그건 그냥 404여야 한다
            if (path.contains(".")) {
                return null;
            }
            String trimmed = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
            for (String candidate : new String[]{trimmed + ".html", trimmed + "/index.html"}) {
                Resource found = super.getResource(candidate, location);
                if (found != null) {
                    return found;
                }
            }
            return super.getResource("404.html", location);
        }
    }
}
