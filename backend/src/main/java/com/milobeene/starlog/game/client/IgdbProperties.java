package com.milobeene.starlog.game.client;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * IGDB 접속 설정 (J-7).
 *
 * RAWG는 키 하나였지만 IGDB는 **Twitch OAuth2 client_credentials**라 자격증명이 둘이다.
 * 둘로 액세스 토큰을 받아 쓰고, 토큰은 약 64일 뒤 만료된다 (IgdbTokenProvider가 관리).
 *
 * 기본값을 yml이 아니라 compact 생성자에 두는 이유 — 테스트가 이 record를 직접 만들 때도
 * 같은 값을 쓰게 된다. yml에만 적으면 두 경로의 기본값이 갈라진다
 */
@ConfigurationProperties(prefix = "app.igdb")
public record IgdbProperties(
        String baseUrl,
        String tokenUrl,
        String clientId,
        String clientSecret,
        Duration connectTimeout,
        Duration readTimeout,
        int searchLimit,
        /** 만료 이 시간 전부터 미리 갱신한다. 만료 직전 요청이 401로 새는 걸 막는다 */
        Duration tokenRenewMargin,
        /** 호출 간 최소 간격. IGDB 제한이 초당 4회라 260ms면 약 3.8회/초 (§6-①) */
        Duration minCallInterval,
        /**
         * 게이트에서 자리를 기다릴 최대 시간. **넘으면 기다리지 않고 429로 돌려보낸다.**
         *
         * 무한정 기다리면 앞선 요청이 밀릴수록 뒷사람의 대기가 선형으로 늘어나
         * 화면이 "멈춘 것"처럼 보인다. 초당 4건이라 800ms면 세 자리는 지나간다 —
         * 그래도 못 잡았으면 진짜로 붐비는 것이고, 그때는 바로 알려주는 게 낫다
         */
        Duration maxGateWait,
        /** 동시에 열어둘 수 있는 IGDB 요청 수. IGDB 한도가 8이라 여유를 두고 6 */
        Integer maxConcurrent
) {

    public IgdbProperties {
        baseUrl = isBlank(baseUrl) ? "https://api.igdb.com/v4" : baseUrl;
        tokenUrl = isBlank(tokenUrl) ? "https://id.twitch.tv/oauth2/token" : tokenUrl;
        connectTimeout = connectTimeout == null ? Duration.ofSeconds(3) : connectTimeout;
        readTimeout = readTimeout == null ? Duration.ofSeconds(5) : readTimeout;
        searchLimit = searchLimit <= 0 ? 20 : searchLimit;
        tokenRenewMargin = tokenRenewMargin == null ? Duration.ofDays(1) : tokenRenewMargin;
        minCallInterval = minCallInterval == null ? Duration.ofMillis(260) : minCallInterval;
        maxGateWait = maxGateWait == null ? Duration.ofMillis(800) : maxGateWait;
        maxConcurrent = (maxConcurrent == null || maxConcurrent <= 0) ? 6 : maxConcurrent;
    }

    public boolean hasCredentials() {
        return !isBlank(clientId) && !isBlank(clientSecret);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
