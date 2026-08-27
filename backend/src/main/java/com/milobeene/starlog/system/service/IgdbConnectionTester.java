package com.milobeene.starlog.system.service;

import com.milobeene.starlog.game.client.IgdbProperties;
import com.milobeene.starlog.system.dto.IgdbTestResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.List;
import java.util.Map;

/**
 * IGDB 키가 실제로 되는지 확인한다 (2026-08-28).
 *
 * ## 왜 단계를 나누나
 *
 * "실패했습니다" 한 줄이면 **키가 틀린 건지 인터넷이 없는 건지** 알 수가 없다.
 * 사용자가 키를 안 넣고 접속했다가 빈 화면만 하염없이 본 게 이 기능의 출발점이다.
 *
 *   1. 토큰 발급 — 키가 맞나 (Twitch)
 *   2. 검색 한 번 — 실제로 도나 (IGDB)
 *
 * 1은 되는데 2가 안 되면 키가 아니라 IGDB 쪽 문제다. 그 구분이 화면에 보여야 한다.
 *
 * ## 저장 전에 시험한다
 *
 * 저장부터 하면 틀린 키가 들어간 뒤에야 알게 되고, 그 사이 검색이 전부 502가 된다.
 * 그래서 인자로 받은 값으로 **한 번 쓰고 버리는 클라이언트**를 만든다
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IgdbConnectionTester {

    private final RestClient.Builder builder;
    private final IgdbProperties properties;

    public IgdbTestResult test(String clientId, String clientSecret) {
        if (isBlank(clientId) || isBlank(clientSecret)) {
            return new IgdbTestResult(false, false, false,
                    "클라이언트 ID와 시크릿을 모두 입력해 주세요");
        }

        String token;
        try {
            Map<String, Object> response = builder.build().post()
                    .uri(properties.tokenUrl()
                            + "?client_id=" + clientId.strip()
                            + "&client_secret=" + clientSecret.strip()
                            + "&grant_type=client_credentials")
                    .retrieve()
                    .body(new ParameterizedTypeReference<Map<String, Object>>() {});
            token = response == null ? null : (String) response.get("access_token");
        } catch (RestClientException e) {
            log.info("IGDB 토큰 발급 실패 — 테스트", e);
            return new IgdbTestResult(false, false, false,
                    "키가 거부되었습니다. 클라이언트 ID와 시크릿을 확인해 주세요");
        }

        if (token == null) {
            return new IgdbTestResult(false, false, false, "토큰을 받지 못했습니다");
        }

        try {
            builder.build().post()
                    .uri(properties.baseUrl() + "/games")
                    .header("Client-ID", clientId.strip())
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.TEXT_PLAIN)
                    .body("fields name; limit 1;")
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<Map<String, Object>>>() {});
        } catch (RestClientException e) {
            log.info("IGDB 검색 실패 — 테스트", e);
            return new IgdbTestResult(false, true, false,
                    "키는 맞지만 게임 검색이 되지 않습니다. 잠시 후 다시 시도해 주세요");
        }

        return new IgdbTestResult(true, true, true, "연결에 성공했습니다");
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
