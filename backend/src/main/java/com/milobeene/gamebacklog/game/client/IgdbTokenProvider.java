package com.milobeene.gamebacklog.game.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.milobeene.gamebacklog.common.exception.ExternalApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.time.Instant;

/**
 * Twitch 액세스 토큰 관리 (J-7-3).
 *
 * RAWG에는 없던 계층이다. RAWG는 URL에 키를 붙이면 끝이었지만 IGDB는
 * client_credentials로 토큰을 받아야 하고, 그 토큰이 **약 64일 뒤 만료된다**.
 *
 * 매 요청마다 발급받으면 안 된다 — 호출이 2배가 되고 Twitch 쪽 제한도 있다.
 * 그래서 캐시하되, 세 가지를 대비한다:
 *   1. 만료 임박  → tokenRenewMargin(기본 1일) 전부터 미리 갱신
 *   2. 서버 재시작 → 캐시가 비어 있으니 첫 호출에 발급
 *   3. 시크릿 회전·서버측 폐기 → 401을 받은 쪽(HttpIgdbClient)이 forceRefresh()를 부른다
 *
 * volatile + synchronized인 이유 — 여러 요청 스레드가 동시에 만료를 발견할 수 있다.
 * 읽기는 락 없이(volatile), 발급만 직렬화하고 안에서 한 번 더 확인한다(double-checked)
 */
@Slf4j
@Component
public class IgdbTokenProvider {

    private final RestClient tokenRestClient;
    private final IgdbProperties properties;

    private volatile CachedToken cached;

    public IgdbTokenProvider(RestClient igdbTokenRestClient, IgdbProperties properties) {
        this.tokenRestClient = igdbTokenRestClient;
        this.properties = properties;
    }

    /** 유효한 토큰. 없거나 만료가 임박하면 새로 받는다 */
    public String token() {
        CachedToken current = cached;
        if (current != null && current.isUsableAt(Instant.now())) {
            return current.value();
        }
        return issue();
    }

    /** 401을 받았을 때. 캐시를 버리고 무조건 새로 받는다 */
    public String forceRefresh() {
        log.info("IGDB 토큰을 강제로 재발급합니다 (401 응답)");
        cached = null;
        return issue();
    }

    private synchronized String issue() {
        // 락을 기다리는 사이 다른 스레드가 이미 받아뒀을 수 있다
        CachedToken current = cached;
        if (current != null && current.isUsableAt(Instant.now())) {
            return current.value();
        }

        if (!properties.hasCredentials()) {
            throw new ExternalApiException(
                    "IGDB 자격증명이 없습니다 (app.igdb.client-id / client-secret)");
        }

        TokenResponse response;
        try {
            response = tokenRestClient.post()
                    .uri(uri -> uri.queryParam("client_id", properties.clientId())
                            .queryParam("client_secret", properties.clientSecret())
                            .queryParam("grant_type", "client_credentials")
                            .build())
                    .retrieve()
                    .body(TokenResponse.class);
        } catch (RestClientException e) {
            log.error("Twitch 토큰 발급 실패", e);
            throw new ExternalApiException("게임 정보 서비스 인증에 실패했습니다", e);
        }

        if (response == null || response.accessToken() == null) {
            throw new ExternalApiException("Twitch 토큰 응답이 비어 있습니다");
        }

        Instant expiresAt = Instant.now().plusSeconds(response.expiresIn());
        cached = new CachedToken(response.accessToken(), expiresAt, properties.tokenRenewMargin());

        log.info("IGDB 토큰 발급 완료 — 만료 {} ({}일 뒤)",
                expiresAt, Duration.ofSeconds(response.expiresIn()).toDays());

        return response.accessToken();
    }

    private record CachedToken(String value, Instant expiresAt, Duration renewMargin) {

        boolean isUsableAt(Instant now) {
            return now.isBefore(expiresAt.minus(renewMargin));
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record TokenResponse(
            @JsonProperty("access_token") String accessToken,
            @JsonProperty("expires_in") long expiresIn,
            @JsonProperty("token_type") String tokenType) {
    }
}
