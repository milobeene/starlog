package com.milobeene.gamebacklog.game.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * RAWG 전용 RestClient 조립 (J-1).
 *
 * RestClient.Builder는 부트가 자동 설정으로 주는 빈이다. 새로 만들지 않고 받아 쓰는 이유 —
 * 우리 앱의 Jackson 설정이 이미 얹혀 있다. RestClient.builder()로 직접 만들면 그게 빠진다.
 *
 * **타임아웃이 이 설정의 핵심이다.** 안 주면 무한 대기가 기본값이라,
 * RAWG가 멈추면 우리 요청 스레드가 같이 멈춘다 — 장애가 그대로 전염된다 (FR-SYS-04)
 */
@Slf4j
@Configuration
@EnableConfigurationProperties(RawgProperties.class)
public class RawgClientConfig {

    @Bean
    public RestClient rawgRestClient(RestClient.Builder builder, RawgProperties properties) {
        if (!properties.hasApiKey()) {
            // 기동은 시킨다 — 키 없이도 앱 전체가 떠야 로컬·CI가 돌아간다.
            // 실제 호출 시점에 HttpRawgClient가 502로 끊는다
            log.warn("RAWG API 키가 없습니다 (RAWG_API_KEY). 게임 검색·담기가 502로 실패합니다");
        }

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(properties.connectTimeout());
        factory.setReadTimeout(properties.readTimeout());

        return builder
                .baseUrl(properties.baseUrl())
                // RAWG 이용약관이 식별 가능한 User-Agent를 요구한다
                .defaultHeader("User-Agent", "game-backlog/0.1")
                .requestFactory(factory)
                .build();
    }
}
