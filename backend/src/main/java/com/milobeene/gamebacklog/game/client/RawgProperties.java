package com.milobeene.gamebacklog.game.client;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * RAWG 접속 설정 (J-1).
 *
 * record에 @ConfigurationProperties를 붙이면 **생성자 바인딩**이다.
 * 스프링이 yml의 app.rawg.* 를 읽어 생성자 인자로 넘긴다 — 필드가 final이라
 * 기동 이후에는 아무도 못 바꾼다. 빈으로 만들려면 등록이 필요하다(RawgClientConfig).
 *
 * 키는 yml에 적지 않고 환경변수 RAWG_API_KEY로 들어온다. 커밋 사고를 원천 차단
 */
@ConfigurationProperties(prefix = "app.rawg")
public record RawgProperties(
        String baseUrl,
        String apiKey,
        Duration connectTimeout,
        Duration readTimeout,
        int searchLimit
) {

    /**
     * 기본값을 yml이 아니라 여기 두는 이유 — 테스트가 이 record를 직접 만들 때도
     * 같은 값을 쓰게 된다. yml에만 적으면 두 경로의 기본값이 갈라진다.
     * record의 compact 생성자는 인자 검증·보정 자리다 (this.x = x는 자동)
     */
    public RawgProperties {
        baseUrl = (baseUrl == null || baseUrl.isBlank()) ? "https://api.rawg.io/api" : baseUrl;
        connectTimeout = connectTimeout == null ? Duration.ofSeconds(3) : connectTimeout;
        readTimeout = readTimeout == null ? Duration.ofSeconds(5) : readTimeout;
        searchLimit = searchLimit <= 0 ? 20 : searchLimit;
    }

    public boolean hasApiKey() {
        return apiKey != null && !apiKey.isBlank();
    }
}
