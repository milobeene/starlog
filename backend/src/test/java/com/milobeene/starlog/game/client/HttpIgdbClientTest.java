package com.milobeene.starlog.game.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withUnauthorizedRequest;

import com.milobeene.starlog.common.exception.ExternalApiException;
import com.milobeene.starlog.common.exception.NotFoundException;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * IGDB 응답 → 우리 타입 변환만 검증한다 (J-7-4). 스프링 컨텍스트를 안 띄우는 이유 —
 * 여기서 확인할 것은 APIcalypse 쿼리·JSON 파싱·예외 변환뿐이고, DB·시큐리티는 상관이 없다.
 *
 * MockRestServiceServer는 RestClient의 요청 팩토리를 가로채 가짜 응답을 돌려준다.
 * 네트워크는 안 나가지만 **메시지 컨버터는 진짜로 돈다** — 파싱 실수가 여기서 드러난다.
 *
 * 응답 JSON은 지어낸 게 아니라 **실제 IGDB 응답을 그대로 가져왔다** (docs/igdb-survey.md).
 * 문서만 보고 만든 가짜 응답으로 테스트하면 "내 상상 속 API"를 검증하게 된다
 */
class HttpIgdbClientTest {

    private MockRestServiceServer server;
    private HttpIgdbClient client;
    private StubTokenProvider tokens;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.igdb.com/v4");
        server = MockRestServiceServer.bindTo(builder).build();
        tokens = new StubTokenProvider();
        /*
         * 호출 기록은 이 테스트의 관심사가 아니라 아무것도 안 하는 것을 넣는다.
         * **null이 아니라 빈 구현인 이유** — 클라이언트가 finally에서 무조건 부르므로
         * null이면 그 자리에서 NPE가 나고, 진짜 검증하려던 것(요청 본문·재시도)이 안 보인다
         */
        client = new HttpIgdbClient(builder.build(), tokens, properties(), noRecorder());
    }

    @Test
    public void 검색은_POST로_APIcalypse_본문을_보낸다() {
        //given
        server.expect(requestTo(Matchers.containsString("/games")))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Client-ID", "cid"))
                .andExpect(header("Authorization", "Bearer tok-1"))
                // RAWG는 쿼리스트링이었지만 IGDB는 본문에 쿼리가 들어간다
                .andExpect(content().string(Matchers.containsString("search \"hollow knight\";")))
                .andExpect(content().string(Matchers.containsString("limit 20;")))
                .andRespond(withSuccess("""
                        [{"id": 14593, "name": "Hollow Knight",
                          "first_release_date": 1487894400,
                          "cover": {"id": 533941, "image_id": "cobfzp"}}]""",
                        MediaType.APPLICATION_JSON));

        //when
        List<CatalogGameSummary> results = client.search("hollow knight");

        //then
        assertThat(results).hasSize(1);
        assertThat(results.get(0).externalId()).isEqualTo("14593");
        assertThat(results.get(0).name()).isEqualTo("Hollow Knight");
        assertThat(results.get(0).releasedOn()).isEqualTo(LocalDate.of(2017, 2, 24));
        assertThat(results.get(0).coverImageId()).isEqualTo("cobfzp");
        server.verify();
    }

    @Test
    public void 검색은_모드와_에디션을_쿼리에서_제외한다() {
        //given — version_parent만으로는 모드가 안 걸러진다 (실측, docs/igdb-survey.md §6-④)
        server.expect(requestTo(Matchers.containsString("/games")))
                .andExpect(content().string(Matchers.containsString("version_parent = null")))
                .andExpect(content().string(Matchers.containsString("game_type = (0,3,4,8,9,10,11)")))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        //when
        client.search("hollow knight");

        //then
        server.verify();
    }

    @Test
    public void 검색어의_따옴표는_이스케이프된다() {
        //given — APIcalypse의 search "..." 안에 그대로 들어가므로 막지 않으면 쿼리가 깨진다
        server.expect(requestTo(Matchers.containsString("/games")))
                .andExpect(content().string(Matchers.containsString("search \"say \\\"hi\\\"\";")))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        //when
        client.search("say \"hi\"");

        //then
        server.verify();
    }

    @Test
    public void 상세는_multiquery로_게임과_클리어시간을_한_번에_받는다() {
        //given — 실제 IGDB 응답 형태
        server.expect(requestTo(Matchers.containsString("/multiquery")))
                .andExpect(content().string(Matchers.containsString("query games \"game\"")))
                .andExpect(content().string(Matchers.containsString("query game_time_to_beats \"timeToBeat\"")))
                .andRespond(withSuccess("""
                        [{"name": "game", "result": [{
                            "id": 14593,
                            "name": "Hollow Knight",
                            "first_release_date": 1487894400,
                            "cover": {"id": 533941, "image_id": "cobfzp"},
                            "genres": [{"id": 8, "name": "Platform"}, {"id": 31, "name": "Adventure"}],
                            "involved_companies": [
                              {"id": 1, "company": {"id": 7263, "name": "Team Cherry"},
                               "developer": true, "publisher": true},
                              {"id": 2, "company": {"id": 99, "name": "Skybound Games"},
                               "developer": false, "publisher": true}
                            ]}]},
                         {"name": "timeToBeat", "result": [{"id": 936, "normally": 132982}]}]""",
                        MediaType.APPLICATION_JSON));

        //when
        CatalogGameDetail detail = client.findById("14593");

        //then — 같은 회사가 개발사이자 퍼블리셔인 경우가 흔해서 불리언 하나로 갈라 담는다
        assertThat(detail.developers()).containsExactly("Team Cherry");
        assertThat(detail.publishers()).containsExactly("Team Cherry", "Skybound Games");
        assertThat(detail.genres()).containsExactly("Platform", "Adventure");
        assertThat(detail.releasedOn()).isEqualTo(LocalDate.of(2017, 2, 24));
        assertThat(detail.coverImageId()).isEqualTo("cobfzp");
        // 132982초 = 36.9시간 → 37
        assertThat(detail.mainExtraHours()).isEqualTo(37);
    }

    @Test
    public void 출시일이_없으면_미정으로_보고_null이다() {
        //given — game_status를 보지 않는다. 실측에서 그 값이 비어 있는 게임이 있었다
        server.expect(requestTo(Matchers.containsString("/multiquery")))
                .andRespond(withSuccess("""
                        [{"name": "game", "result": [{"id": 141408, "name": "Zaos"}]},
                         {"name": "timeToBeat", "result": []}]""",
                        MediaType.APPLICATION_JSON));

        //when
        CatalogGameDetail detail = client.findById("141408");

        //then
        assertThat(detail.releasedOn()).isNull();
        assertThat(detail.mainExtraHours()).isNull();
        assertThat(detail.coverImageId()).isNull();
        assertThat(detail.developers()).isEmpty();
    }

    @Test
    public void 결과가_빈_배열이면_404가_아니라_NotFound다() {
        //given — IGDB는 없는 id에 404를 주지 않는다. 빈 result를 준다
        server.expect(requestTo(Matchers.containsString("/multiquery")))
                .andRespond(withSuccess("""
                        [{"name": "game", "result": []}, {"name": "timeToBeat", "result": []}]""",
                        MediaType.APPLICATION_JSON));

        //when //then — 장애가 아니므로 502로 올리지 않는다
        assertThatThrownBy(() -> client.findById("99999999"))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    public void id가_숫자가_아니면_호출하지_않고_404다() {
        //given — APIcalypse 본문에 그대로 끼워 넣기 때문에 인젝션 방어이기도 하다

        //when //then
        assertThatThrownBy(() -> client.findById("1; drop table game;--"))
                .isInstanceOf(NotFoundException.class);
        server.verify();   // 기대 0건, 실제 0건
    }

    @Test
    public void _401이면_토큰을_새로_받아_한_번만_재시도한다() {
        //given — 시크릿 회전·서버측 폐기는 유효기간이 남아도 일어난다
        server.expect(requestTo(Matchers.containsString("/games")))
                .andExpect(header("Authorization", "Bearer tok-1"))
                .andRespond(withUnauthorizedRequest());
        server.expect(requestTo(Matchers.containsString("/games")))
                .andExpect(header("Authorization", "Bearer tok-2"))
                .andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));

        //when
        List<CatalogGameSummary> results = client.search("hollow");

        //then
        assertThat(results).isEmpty();
        assertThat(tokens.forceRefreshCount).isEqualTo(1);
        server.verify();
    }

    @Test
    public void 재시도도_401이면_ExternalApiException이_된다() {
        /*
         * given — 무한 재시도는 장애를 증폭시킨다. 딱 한 번만 다시 시도한다.
         *
         * **예전엔 스프링의 Unauthorized가 그대로 밖으로 샜다.** 어드바이스에 그걸 잡는
         * 핸들러가 없어서 500 + 계약 밖 에러 형태가 나갔다 — 바로 아래 테스트가 못 박은
         * "스프링 예외가 밖으로 새지 않는다"(FR-SYS-04)를 이 경로만 어기고 있었다.
         * 시크릿을 회전하면 실제로 밟는 길이다
         */
        server.expect(requestTo(Matchers.containsString("/games")))
                .andRespond(withUnauthorizedRequest());
        server.expect(requestTo(Matchers.containsString("/games")))
                .andRespond(withUnauthorizedRequest());

        //when //then
        assertThatThrownBy(() -> client.search("hollow"))
                .isInstanceOf(ExternalApiException.class)
                .hasMessageContaining("인증");
        assertThat(tokens.forceRefreshCount).as("재시도는 여전히 한 번뿐이다").isEqualTo(1);
    }

    @Test
    public void 서버_오류는_ExternalApiException이_된다() {
        //given
        server.expect(requestTo(Matchers.containsString("/games")))
                .andRespond(withServerError());

        //when //then — FR-SYS-04. 스프링의 RestClientException이 밖으로 새지 않는다
        assertThatThrownBy(() -> client.search("아무거나"))
                .isInstanceOf(ExternalApiException.class);
    }

    /** min-call-interval을 0으로 둔다 — 테스트에 260ms짜리 sleep이 끼면 안 된다 */
    private IgdbProperties properties() {
        return new IgdbProperties("https://api.igdb.com/v4", null, "cid", "secret",
                null, null, 20, null, Duration.ZERO, Duration.ZERO, null);
    }

    /** 토큰 발급 자체는 IgdbTokenProviderTest가 본다. 여기서는 "몇 번 갈아탔나"만 필요하다 */
    private static class StubTokenProvider extends IgdbTokenProvider {

        int forceRefreshCount;

        StubTokenProvider() {
            /* 앱 설정 서비스는 없다 — 없으면 부팅 설정으로 폴백하는 게 규칙이다 */
            super(RestClient.create(), new IgdbProperties(null, null, "cid", "secret",
                    null, null, 20, null, Duration.ZERO, Duration.ZERO, null), noSettings());
        }

        @Override
        public String token() {
            return forceRefreshCount == 0 ? "tok-1" : "tok-2";
        }

        @Override
        public String forceRefresh() {
            forceRefreshCount++;
            return "tok-2";
        }
    }

    /** 호출 기록을 안 하는 기록기. DB 없이 도는 테스트라 진짜 빈을 쓸 수 없다 */
    private static com.milobeene.starlog.system.service.ApiCallRecorder noRecorder() {
        return new com.milobeene.starlog.system.service.ApiCallRecorder(null) {
            @Override
            public void record(com.milobeene.starlog.system.domain.ApiProvider provider,
                               String operation, boolean success) {
                // 아무것도 안 한다
            }
        };
    }


    /** 앱 설정 빈이 없는 상태. HttpIgdbClient는 스프링 없이 도는 테스트다 */
    private static org.springframework.beans.factory.ObjectProvider<
            com.milobeene.starlog.system.service.AppSettingService> noSettings() {
        return new org.springframework.beans.factory.ObjectProvider<>() {
            @Override
            public com.milobeene.starlog.system.service.AppSettingService getObject() {
                throw new UnsupportedOperationException();
            }

            @Override
            public com.milobeene.starlog.system.service.AppSettingService getObject(Object... args) {
                throw new UnsupportedOperationException();
            }

            @Override
            public com.milobeene.starlog.system.service.AppSettingService getIfAvailable() {
                return null;
            }

            @Override
            public com.milobeene.starlog.system.service.AppSettingService getIfUnique() {
                return null;
            }
        };
    }

}
