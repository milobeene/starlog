package com.milobeene.starlog.game.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.milobeene.starlog.common.exception.ExternalApiException;
import com.milobeene.starlog.common.exception.TooManyRequestsException;
import com.milobeene.starlog.common.exception.NotFoundException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.milobeene.starlog.system.domain.ApiProvider;
import com.milobeene.starlog.system.service.ApiCallRecorder;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;

/**
 * IGDB HTTP 구현 (J-7-4).
 *
 * 바깥 세계의 형태(APIcalypse 본문, snake_case, Unix 타임스탬프, 초 단위 시간)를
 * 이 클래스 안에 가둔다. 밖으로 나가는 건 CatalogGameSummary·CatalogGameDetail뿐이다.
 *
 * RAWG 구현과 크게 다른 점 셋:
 *   1. GET이 아니라 **POST**. 쿼리가 URL이 아니라 본문(APIcalypse)에 들어간다
 *   2. 헤더에 Client-ID와 Bearer 토큰. 토큰은 IgdbTokenProvider가 관리하고, **401이면 한 번 재시도**한다
 *   3. 초당 4회 제한이 있어 호출 간 최소 간격을 둔다
 */
@Slf4j
@Component
public class HttpIgdbClient implements GameCatalogClient {

    /**
     * 검색에서 허용할 game_type — Main Game(0)·Bundle(3)·Standalone Expansion(4)
     * ·Remake(8)·Remaster(9)·Expanded(10)·Port(11).
     *
     * **`version_parent = null`만으로는 부족하다.** 실측에서 `search "hollow knight"`의 1위가
     * 모드(game_type 5)였다 — 모드는 version_parent가 아니라 parent_game을 갖기 때문에
     * IGDB 문서가 권장하는 패턴만으로는 안 걸러진다 (docs/igdb-survey.md §6-④)
     */
    private static final String ALLOWED_GAME_TYPES = "(0,3,4,8,9,10,11)";

    private final RestClient igdbRestClient;
    private final IgdbTokenProvider tokenProvider;
    private final IgdbProperties properties;
    /* 사용량 화면이 "최근 1분/24시간/30일"을 셀 수 있게 호출을 한 줄씩 남긴다 (v1.0 8단계) */
    private final ApiCallRecorder apiCallRecorder;

    private final Object rateLock = new Object();
    private long lastCallAtMillis;

    /**
     * 동시에 열어둘 요청 수. IGDB는 초당 4건과 **별개로** 동시 열린 요청 8개를 제한한다.
     * 공정 모드(true) — 먼저 온 스레드가 먼저 자리를 잡는다. 아니면 운 나쁜 요청이
     * 계속 밀려 매번 429를 받는다
     */
    private final Semaphore gate;


    public HttpIgdbClient(RestClient igdbRestClient, IgdbTokenProvider tokenProvider,
                          IgdbProperties properties, ApiCallRecorder apiCallRecorder) {
        this.igdbRestClient = igdbRestClient;
        this.tokenProvider = tokenProvider;
        this.properties = properties;
        this.apiCallRecorder = apiCallRecorder;
        this.gate = new Semaphore(properties.maxConcurrent(), true);
    }

    /** /admin 시스템 탭용. 누적 호출 수와 자리를 못 잡아 돌려보낸 수 */


    @Override
    public List<CatalogGameSummary> search(String keyword) {
        String query = """
                search "%s";
                fields name, first_release_date, cover.image_id;
                where version_parent = null & game_type = %s;
                limit %d;""".formatted(escape(keyword), ALLOWED_GAME_TYPES, properties.searchLimit());

        List<GameNode> nodes = post("games", query,
                new ParameterizedTypeReference<List<GameNode>>() {}, "search q=" + keyword);

        if (nodes == null) {
            return List.of();
        }
        return nodes.stream().map(HttpIgdbClient::toSummary).toList();
    }

    @Override
    public CatalogGameDetail findById(String externalId) {
        long id = parseId(externalId);

        /*
         * multiquery — 엔드포인트가 다른 두 쿼리를 한 요청에 묶는다 (최대 10개).
         * game_time_to_beats는 games와 별도 엔드포인트라 원래 호출이 2회가 되는데,
         * 이걸로 1회를 유지한다. 응답은 [{name, result:[...]}, ...] 형태로 온다
         */
        String query = """
                query games "game" {
                  fields name, first_release_date, cover.image_id,
                         artworks.image_id, summary, storyline,
                         rating, rating_count, platforms.abbreviation, platforms.name,
                         involved_companies.company.name,
                         involved_companies.developer,
                         involved_companies.publisher,
                         genres.name;
                  where id = %d;
                };
                query game_time_to_beats "timeToBeat" {
                  fields hastily, normally, completely, count;
                  where game_id = %d;
                };""".formatted(id, id);

        List<MultiQueryBlock> blocks = post("multiquery", query,
                new ParameterizedTypeReference<List<MultiQueryBlock>>() {}, "detail id=" + externalId);

        GameNode game = firstOf(blocks, "game");
        if (game == null) {
            // 결과가 빈 배열로 온다 — 404가 아니다. 없는 id를 502로 올리면 원인이 가려진다
            throw new NotFoundException("게임을 찾을 수 없습니다. externalId=" + externalId);
        }

        GameNode timeToBeat = firstOf(blocks, "timeToBeat");

        return new CatalogGameDetail(
                String.valueOf(game.id()),
                game.name(),
                companyNames(game, InvolvedCompanyNode::isDeveloper),
                companyNames(game, InvolvedCompanyNode::isPublisher),
                names(game.genres()),
                toLocalDate(game.firstReleaseDate()),
                game.coverImageId(),

                game.bannerImageId(),
                game.summary(),
                game.storyline(),
                toRating(game.rating()),
                game.ratingCount(),
                platformNames(game.platforms()),

                toHours(timeToBeat == null ? null : timeToBeat.hastily()),
                toHours(timeToBeat == null ? null : timeToBeat.normally()),
                toHours(timeToBeat == null ? null : timeToBeat.completely()),
                timeToBeat == null ? null : timeToBeat.count());
    }

    /**
     * 호출 한 곳. 토큰 부착·401 재시도·레이트 제한·예외 변환이 여기 모인다.
     *
     * 401 재시도가 필요한 이유 — 토큰은 64일짜리라 만료를 미리 갱신하지만,
     * 시크릿을 회전했거나 Twitch가 서버측에서 폐기하면 유효 기간이 남아도 거절당한다.
     * 그때 캐시를 버리고 새로 받아 **딱 한 번** 다시 시도한다. 무한 재시도는 장애를 증폭시킨다
     */
    private <T> T post(String endpoint, String query, ParameterizedTypeReference<T> type, String what) {
        /*
         * 호출을 한 줄 남긴다 (v1.0 8단계).
         *
         * **성공·실패를 가리지 않고 센다.** IGDB 입장에서는 401도 400도 이미 받은 요청이고
         * 한도를 소모한다. 성공만 세면 화면의 사용량이 실제보다 적게 나온다.
         *
         * 401 뒤 재시도는 **한 번 더 센다** — 실제로 두 번 나갔기 때문이다.
         * `send`가 아니라 여기서 세면 그 재시도가 안 잡히므로, 세는 자리를 send로 내린다
         */
        try {
            return send(endpoint, query, type, tokenProvider.token());

        } catch (HttpClientErrorException.Unauthorized e) {
            log.warn("IGDB 401 — 토큰을 재발급하고 한 번만 다시 시도합니다. {}", what);
            try {
                return send(endpoint, query, type, tokenProvider.forceRefresh());
            } catch (HttpClientErrorException.Unauthorized retryFailed) {
                /*
                 * 새로 받은 토큰도 거부당했다 — 시크릿이 회전됐거나 잘못 설정된 것이다.
                 * **여기서 접지 않으면 그대로 밖으로 새어 500이 된다** — 어드바이스에
                 * RestClientException 핸들러가 없어서 에러 형태까지 계약을 벗어난다.
                 * 502로 접으면 프론트가 이미 처리하는 경로다
                 */
                log.error("IGDB 재발급 토큰도 거부됨 — 자격증명을 확인해야 한다. {}", what, retryFailed);
                throw new ExternalApiException(ExternalApiException.Service.GAME_CATALOG,
                        "게임 정보 서비스 인증에 실패했습니다", retryFailed);
            }
        }
    }

    private <T> T send(String endpoint, String query, ParameterizedTypeReference<T> type, String token) {
        throttle();   // 자리를 못 잡으면 여기서 429로 나간다 — 아래 finally까지 오지 않는다
        boolean succeeded = false;
        try {
            T body = igdbRestClient.post()
                    .uri("/" + endpoint)
                    .header("Client-ID", tokenProvider.credentials().clientId())
                    .header("Authorization", "Bearer " + token)
                    .body(query)
                    .retrieve()
                    .body(type);
            succeeded = true;
            return body;

        } catch (HttpClientErrorException.Unauthorized e) {
            throw e;   // 위에서 재시도 판단

        } catch (RestClientException e) {
            // 타임아웃·연결 실패·429·5xx·역직렬화 실패가 전부 여기로 모인다 (FR-SYS-04)
            log.error("IGDB 호출 실패 — endpoint={}", endpoint, e);
            throw new ExternalApiException(ExternalApiException.Service.GAME_CATALOG, "게임 정보를 가져오지 못했습니다", e);

        } finally {
            /*
             * 호출 기록은 **성공·실패를 가리지 않는다** (v1.0 8단계). IGDB 입장에서는
             * 401도 5xx도 이미 받은 요청이고 한도를 소모한다. 성공만 세면
             * 화면의 사용량이 실제보다 적게 나온다.
             *
             * 여기(send) 안에서 세는 이유 — 401 뒤 재시도가 **실제로 한 번 더 나가므로**
             * 그것도 세야 한다. 바깥(post)에서 세면 재시도가 안 잡힌다
             */
            apiCallRecorder.record(ApiProvider.IGDB, endpoint, succeeded);

            // **실패해도 반드시 돌려준다.** 안 돌려주면 자리가 하나씩 영구히 줄어
            // 결국 모든 요청이 429가 된다
            releaseGate();
        }
    }

    /**
     * 전역 게이트 — 초당 4회 + 동시 8건 (J-7, docs/capacity-planning.md §2-A).
     *
     * **IGDB 한도는 회원당이 아니라 앱 전체(우리 클라이언트 ID)당이다.** 그래서 회원별
     * 배분보다 전역 처리율 제한이 먼저다.
     *
     * **기다리다 지치면 큐에 세우지 않고 즉시 돌려보낸다.** 무한정 기다리면 밀릴수록
     * 뒷사람의 대기가 선형으로 늘어나 화면이 멈춘 것처럼 보인다. 초당 4건이라 실제로는
     * 1초 안에 풀리므로 "바로 다시 시도"가 정직한 안내다.
     *
     * 세마포어(동시성)와 간격(처리율)은 **다른 것을 막는다** — 둘 다 필요하다.
     * 세마포어만 두면 6개가 동시에 나갔다 돌아와 다시 6개가 나가서 초당 4건을 넘고,
     * 간격만 두면 느린 응답이 쌓여 동시 열린 요청이 8을 넘는다
     */
    private void throttle() {
        long maxWait = properties.maxGateWait().toMillis();
        boolean acquired;
        try {
            acquired = maxWait <= 0
                    ? gate.tryAcquire()
                    : gate.tryAcquire(maxWait, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ExternalApiException(ExternalApiException.Service.GAME_CATALOG,
                    "게임 정보 호출 대기 중 중단되었습니다", e);
        }

        if (!acquired) {
            throw new TooManyRequestsException("CATALOG_BUSY",
                    "지금 여러 분이 동시에 검색 중입니다. 바로 다시 시도해 주세요");
        }

        try {
            long interval = properties.minCallInterval().toMillis();
            if (interval <= 0) {
                return;
            }
            /*
             * 간격 대기는 자리를 **잡은 채로** 한다. 놓고 기다리면 그 사이 다른 스레드가
             * 들어와 같은 순간에 나가버려 간격이 무의미해진다
             */
            synchronized (rateLock) {
                long waitMillis = lastCallAtMillis + interval - System.currentTimeMillis();
                if (waitMillis > 0) {
                    Thread.sleep(waitMillis);
                }
                lastCallAtMillis = System.currentTimeMillis();
            }
        } catch (InterruptedException e) {
            releaseGate();
            Thread.currentThread().interrupt();
            throw new ExternalApiException(ExternalApiException.Service.GAME_CATALOG,
                    "게임 정보 호출 대기 중 중단되었습니다", e);
        }
    }

    /** 자리를 돌려준다. **호출이 성공하든 실패하든 반드시** 불려야 한다 (finally) */
    private void releaseGate() {
        gate.release();
    }

    // ── 변환

    private static CatalogGameSummary toSummary(GameNode node) {
        return new CatalogGameSummary(String.valueOf(node.id()), node.name(),
                toLocalDate(node.firstReleaseDate()), node.coverImageId());
    }

    /**
     * 출시일. IGDB의 first_release_date는 **이미 전 플랫폼 최솟값**이라
     * RAWG처럼 platforms[]를 훑어 min을 구할 필요가 없다 (§6.2).
     *
     * 값이 없으면 출시 미정이다. game_status를 보지 않는 이유 — 실측에서 출시일 없는
     * 게임 중 game_status 자체가 비어 있는 것들이 있었다 (docs/igdb-survey.md §6-③)
     */
    private static LocalDate toLocalDate(Long unixSeconds) {
        if (unixSeconds == null) {
            return null;
        }
        return Instant.ofEpochSecond(unixSeconds).atZone(ZoneOffset.UTC).toLocalDate();
    }

    /** normally는 초 단위. 0 이하는 자료 없음으로 본다 */
    private static Integer toHours(Integer seconds) {
        if (seconds == null || seconds <= 0) {
            return null;
        }
        return Math.round(seconds / 3600f);
    }

    private static List<String> companyNames(GameNode game,
                                             java.util.function.Predicate<InvolvedCompanyNode> role) {
        if (game.involvedCompanies() == null) {
            return List.of();
        }
        return game.involvedCompanies().stream()
                .filter(role)
                .map(InvolvedCompanyNode::company)
                .filter(Objects::nonNull)
                .map(NamedNode::name)
                .filter(Objects::nonNull)
                .toList();
    }

    /** IGDB rating은 Double이고 0~100 스케일이다. 우리 BigDecimal(5,2)에 맞춰 반올림한다 */
    private static java.math.BigDecimal toRating(Double rating) {
        if (rating == null || rating <= 0) {
            return null;
        }
        return java.math.BigDecimal.valueOf(rating)
                .setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static List<String> platformNames(List<PlatformNode> nodes) {
        if (nodes == null) {
            return List.of();
        }
        return nodes.stream()
                .map(PlatformNode::label)
                .filter(Objects::nonNull)
                .toList();
    }

    private static List<String> names(List<NamedNode> nodes) {
        if (nodes == null) {
            return List.of();
        }
        return nodes.stream().map(NamedNode::name).filter(Objects::nonNull).toList();
    }

    private static GameNode firstOf(List<MultiQueryBlock> blocks, String name) {
        if (blocks == null) {
            return null;
        }
        return blocks.stream()
                .filter(block -> name.equals(block.name()))
                .map(MultiQueryBlock::result)
                .filter(result -> result != null && !result.isEmpty())
                .map(List::getFirst)
                .findFirst()
                .orElse(null);
    }

    private static long parseId(String externalId) {
        try {
            return Long.parseLong(externalId.strip());
        } catch (NumberFormatException e) {
            // APIcalypse 본문에 그대로 끼워 넣기 때문에 숫자 확인은 인젝션 방어이기도 하다
            throw new NotFoundException("게임 id 형식이 올바르지 않습니다. externalId=" + externalId);
        }
    }

    /** APIcalypse의 search "..." 안에 들어가므로 따옴표·역슬래시를 막는다 */
    private static String escape(String keyword) {
        return keyword.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    // ── IGDB 응답 매핑 전용. package-private으로 두어 밖에서 쓰지 못하게 한다

    /**
     * multiquery 응답 블록. result의 요소가 블록마다 다른 모양인데(게임 / 클리어 시간)
     * 한 record로 흡수한다 — 바깥 세계의 형태를 삼키는 게 이 계층의 일이고,
     * 타입을 나누면 블록별 분기가 여기 밖으로 새어 나간다
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record MultiQueryBlock(String name, List<GameNode> result) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record GameNode(
            Long id,
            String name,
            @JsonProperty("first_release_date") Long firstReleaseDate,
            CoverNode cover,
            List<CoverNode> artworks,
            String summary,
            String storyline,
            Double rating,
            @JsonProperty("rating_count") Integer ratingCount,
            List<PlatformNode> platforms,
            @JsonProperty("involved_companies") List<InvolvedCompanyNode> involvedCompanies,
            List<NamedNode> genres,
            Integer hastily,
            Integer normally,
            Integer completely,
            Integer count) {

        String coverImageId() {
            return cover == null ? null : cover.imageId();
        }

        /** 배너는 첫 번째 아트워크를 쓴다. IGDB가 대표를 지정해주지 않아 순서를 신뢰한다 */
        String bannerImageId() {
            if (artworks == null || artworks.isEmpty()) {
                return null;
            }
            return artworks.getFirst().imageId();
        }
    }

    /** abbreviation이 없는 플랫폼이 있어 name으로 떨어진다 (예: 일부 레트로 기종) */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record PlatformNode(String abbreviation, String name) {

        String label() {
            return (abbreviation != null && !abbreviation.isBlank()) ? abbreviation : name;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CoverNode(@JsonProperty("image_id") String imageId) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record InvolvedCompanyNode(NamedNode company, Boolean developer, Boolean publisher) {

        // record 컴포넌트가 만드는 developer()와 이름이 겹치면 안 되므로 isXxx로 둔다.
        // IGDB는 이 불리언 하나로 개발사/퍼블리셔를 구분한다 — 같은 회사가 둘 다인 경우가 흔하다
        boolean isDeveloper() {
            return Boolean.TRUE.equals(developer);
        }

        boolean isPublisher() {
            return Boolean.TRUE.equals(publisher);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record NamedNode(String name) {
    }
}
