package com.milobeene.gamebacklog.game.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * IGDB 전용 RestClient 조립 (J-7).
 *
 * RestClient가 둘인 이유 — **호스트가 다르다.** 토큰은 id.twitch.tv에서 받고
 * 데이터는 api.igdb.com에서 받는다. baseUrl이 다르니 빈도 나뉜다.
 *
 * RestClient.Builder는 부트가 자동 설정으로 주는 빈이다(spring-boot-starter-restclient).
 * 새로 만들지 않고 받아 쓰는 이유 — 우리 앱의 Jackson 설정이 이미 얹혀 있다.
 *
 * **타임아웃이 이 설정의 핵심이다.** 안 주면 무한 대기가 기본값이라,
 * IGDB가 멈추면 우리 요청 스레드가 같이 멈춘다 — 장애가 그대로 전염된다 (FR-SYS-04)
 */
@Slf4j
@Configuration
@EnableConfigurationProperties(IgdbProperties.class)
public class IgdbClientConfig {

    @Bean
    public RestClient igdbRestClient(RestClient.Builder builder, IgdbProperties properties) {
        if (!properties.hasCredentials()) {
            // 기동은 시킨다 — 자격증명 없이도 앱 전체가 떠야 로컬·CI가 돌아간다.
            // 실제 호출 시점에 IgdbTokenProvider가 502로 끊는다
            log.warn("IGDB 자격증명이 없습니다 (app.igdb.client-id / client-secret). "
                    + "게임 검색·담기가 502로 실패합니다");
        }

        return builder
                .baseUrl(properties.baseUrl())
                // APIcalypse는 JSON이 아니라 평문 쿼리다. 응답만 JSON
                .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
                .defaultHeader("Content-Type", MediaType.TEXT_PLAIN_VALUE)
                .requestFactory(factory(properties))
                .build();
    }

    @Bean
    public RestClient igdbTokenRestClient(RestClient.Builder builder, IgdbProperties properties) {
        return builder
                .baseUrl(properties.tokenUrl())
                .requestFactory(factory(properties))
                .build();
    }

    private static SimpleClientHttpRequestFactory factory(IgdbProperties properties) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(properties.connectTimeout());
        factory.setReadTimeout(properties.readTimeout());
        return factory;
    }
}
