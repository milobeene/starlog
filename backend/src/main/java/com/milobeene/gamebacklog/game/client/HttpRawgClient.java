package com.milobeene.gamebacklog.game.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.milobeene.gamebacklog.common.exception.ExternalApiException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriBuilder;

import java.net.URI;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Stream;

/**
 * RAWG HTTP 구현 (J-1, J-6).
 *
 * 바깥 세계의 형태(snake_case, 중첩 객체, null 투성이)를 이 클래스 안에 가둔다.
 * 밖으로 나가는 건 RawgGameSummary·RawgGameDetail뿐이라, RAWG 응답이 바뀌어도
 * 서비스 계층은 안 흔들린다.
 *
 * 모든 실패는 ExternalApiException으로 통일한다 — 스프링의 RestClientException이
 * 서비스·컨트롤러까지 새면 웹 계층이 HTTP 클라이언트 예외를 알아야 한다
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HttpRawgClient implements RawgClient {

    private final RestClient rawgRestClient;
    private final RawgProperties properties;

    @Override
    public List<RawgGameSummary> search(String keyword) {
        SearchPage page = call(uri -> uri.path("/games")
                        .queryParam("key", properties.apiKey())
                        .queryParam("search", keyword)
                        .queryParam("page_size", properties.searchLimit())
                        .build(),
                SearchPage.class, "search q=" + keyword);

        if (page == null || page.results() == null) {
            return List.of();
        }

        return page.results().stream()
                .map(node -> new RawgGameSummary(
                        String.valueOf(node.id()), node.name(), resolveReleasedOn(node)))
                .toList();
    }

    @Override
    public RawgGameDetail findById(String rawgId) {
        GameNode node = call(uri -> uri.path("/games/{id}")
                        .queryParam("key", properties.apiKey())
                        .build(rawgId),
                GameNode.class, "detail id=" + rawgId);

        if (node == null) {
            throw new ExternalApiException("RAWG 응답이 비어 있습니다. rawgId=" + rawgId);
        }

        return new RawgGameDetail(
                String.valueOf(node.id()),
                node.name(),
                names(node.developers()),
                names(node.publishers()),
                names(node.genres()),
                resolveReleasedOn(node),
                // playtime 0은 "0시간"이 아니라 "자료 없음"이다 (Steam 기준 평균, 콘솔 전용은 흔히 0)
                node.playtime() == null || node.playtime() <= 0 ? null : node.playtime());
    }

    /**
     * 호출 한 곳. 키 검사·예외 변환·로깅이 여기 모인다.
     *
     * RestClient는 4xx·5xx에서 스스로 예외를 던진다(RestTemplate과 같은 기본 동작).
     * 그래서 정상 흐름에는 상태코드 분기가 없고, catch 쪽만 갈라진다
     */
    private <T> T call(Function<UriBuilder, URI> uriFunction, Class<T> type, String what) {
        if (!properties.hasApiKey()) {
            throw new ExternalApiException("RAWG API 키가 설정되지 않았습니다 (RAWG_API_KEY)");
        }

        try {
            return rawgRestClient.get()
                    .uri(uriFunction)
                    .retrieve()
                    .body(type);

        } catch (HttpClientErrorException.NotFound e) {
            // RAWG에 그 id가 없는 것은 장애가 아니다. 502로 올리면 원인이 가려진다
            throw new NotFoundException("RAWG에서 게임을 찾을 수 없습니다. " + what);

        } catch (RestClientException e) {
            // 타임아웃·연결 실패·4xx·5xx·역직렬화 실패가 전부 여기로 모인다 (FR-SYS-04)
            log.error("RAWG 호출 실패 — {}", what, e);
            throw new ExternalApiException("게임 정보를 가져오지 못했습니다", e);
        }
    }

    private static List<String> names(List<NamedNode> nodes) {
        if (nodes == null) {
            return List.of();
        }
        return nodes.stream()
                .map(NamedNode::name)
                .filter(Objects::nonNull)
                .toList();
    }

    /**
     * 출시일 = min(released, platforms[].released_at).
     *
     * RAWG의 `released`는 대표 출시일 하나뿐이라 플랫폼별로 먼저 나온 날짜를 놓친다.
     * 스펙이 "플랫폼별 출시일 중 가장 이른 날짜"(§6.2)를 요구하므로 둘을 합쳐 최솟값을 쓴다.
     * tba(To Be Announced)면 날짜가 있어도 미정으로 본다
     */
    private static LocalDate resolveReleasedOn(GameNode node) {
        if (Boolean.TRUE.equals(node.tba())) {
            return null;
        }

        Stream<LocalDate> platformDates = node.platforms() == null
                ? Stream.empty()
                : node.platforms().stream().map(PlatformNode::releasedAt);

        return Stream.concat(Stream.ofNullable(node.released()), platformDates)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);
    }

    // ── RAWG 응답 매핑 전용. package-private으로 두어 밖에서 쓰지 못하게 한다.
    // @JsonIgnoreProperties — RAWG는 우리가 안 쓰는 필드를 수십 개 더 준다.
    // 부트 기본 설정도 모르는 필드를 무시하지만, 여기 명시해 컨버터 설정과 무관하게 만든다

    @JsonIgnoreProperties(ignoreUnknown = true)
    record SearchPage(List<GameNode> results) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GameNode(
            Long id,
            String name,
            LocalDate released,
            Boolean tba,
            Integer playtime,
            List<PlatformNode> platforms,
            List<NamedNode> developers,
            List<NamedNode> publishers,
            List<NamedNode> genres) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record PlatformNode(@JsonProperty("released_at") LocalDate releasedAt) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NamedNode(String name) {
    }
}
