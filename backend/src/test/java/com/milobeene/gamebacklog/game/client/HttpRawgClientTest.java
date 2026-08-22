package com.milobeene.gamebacklog.game.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withResourceNotFound;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.milobeene.gamebacklog.common.exception.ExternalApiException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import java.time.LocalDate;
import java.util.List;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * RAWG 응답 → 우리 타입 변환만 검증한다. 스프링 컨텍스트를 안 띄우는 이유 —
 * 여기서 확인할 것은 JSON 파싱과 예외 변환뿐이고, DB·시큐리티는 상관이 없다.
 *
 * MockRestServiceServer는 RestClient의 요청 팩토리를 가로채 가짜 응답을 돌려준다.
 * 네트워크는 안 나가지만 **메시지 컨버터는 진짜로 돈다** — 파싱 실수가 여기서 드러난다
 */
class HttpRawgClientTest {

    private MockRestServiceServer server;
    private HttpRawgClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.rawg.io/api");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new HttpRawgClient(builder.build(), properties("test-key"));
    }

    @Test
    public void 검색_결과를_요약으로_바꾼다() {
        //given
        server.expect(requestTo(Matchers.containsString("/games")))
                .andExpect(queryParam("search", "hollow"))
                .andExpect(queryParam("key", "test-key"))
                .andRespond(withSuccess("""
                        {"count": 1, "results": [
                          {"id": 9767, "name": "Hollow Knight", "released": "2017-02-24",
                           "platforms": [{"released_at": "2017-02-24"}]}
                        ]}""", MediaType.APPLICATION_JSON));

        //when
        List<RawgGameSummary> results = client.search("hollow");

        //then
        assertThat(results).hasSize(1);
        assertThat(results.get(0).rawgId()).isEqualTo("9767");
        assertThat(results.get(0).name()).isEqualTo("Hollow Knight");
        server.verify();
    }

    @Test
    public void 출시일은_플랫폼별_출시일까지_합쳐_가장_이른_날짜다() {
        //given — 대표 released보다 먼저 나온 플랫폼이 있다 (§6.2)
        server.expect(requestTo(Matchers.containsString("/games/9767")))
                .andRespond(withSuccess("""
                        {"id": 9767, "name": "Hollow Knight",
                         "released": "2017-04-11",
                         "platforms": [{"released_at": "2018-06-12"},
                                       {"released_at": "2017-02-24"},
                                       {"released_at": null}],
                         "developers": [{"name": "Team Cherry"}],
                         "publishers": [{"name": "Team Cherry"}],
                         "genres": [{"name": "Action"}, {"name": "Indie"}],
                         "playtime": 30}""", MediaType.APPLICATION_JSON));

        //when
        RawgGameDetail detail = client.findById("9767");

        //then
        assertThat(detail.releasedOn()).isEqualTo(LocalDate.of(2017, 2, 24));
        assertThat(detail.developers()).containsExactly("Team Cherry");
        assertThat(detail.genres()).containsExactly("Action", "Indie");
        assertThat(detail.averagePlaytimeHours()).isEqualTo(30);
    }

    @Test
    public void tba면_날짜가_있어도_출시일은_null이다() {
        //given — 미정 표시가 붙은 게임은 날짜를 신뢰하지 않는다
        server.expect(requestTo(Matchers.containsString("/games/1")))
                .andRespond(withSuccess("""
                        {"id": 1, "name": "언젠가 나올 게임", "tba": true,
                         "released": "2030-01-01",
                         "platforms": [{"released_at": "2030-01-01"}]}""",
                        MediaType.APPLICATION_JSON));

        //when
        RawgGameDetail detail = client.findById("1");

        //then
        assertThat(detail.releasedOn()).isNull();
    }

    @Test
    public void playtime_0은_자료_없음으로_본다() {
        //given — Steam 기준 평균이라 콘솔 전용은 0이 흔하다 (§6.2)
        server.expect(requestTo(Matchers.containsString("/games/2")))
                .andRespond(withSuccess("""
                        {"id": 2, "name": "Console Only", "playtime": 0}""",
                        MediaType.APPLICATION_JSON));

        //when //then
        assertThat(client.findById("2").averagePlaytimeHours()).isNull();
    }

    @Test
    public void 없는_게임은_404가_아니라_NotFound다() {
        //given
        server.expect(requestTo(Matchers.containsString("/games/999")))
                .andRespond(withResourceNotFound());

        //when //then — 장애가 아니므로 502로 올리지 않는다
        assertThatThrownBy(() -> client.findById("999"))
                .isInstanceOf(NotFoundException.class);
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

    @Test
    public void 키가_없으면_호출조차_하지_않는다() {
        //given
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.rawg.io/api");
        MockRestServiceServer noCallServer = MockRestServiceServer.bindTo(builder).build();
        HttpRawgClient keyless = new HttpRawgClient(builder.build(), properties(null));

        //when //then
        assertThatThrownBy(() -> keyless.search("hollow"))
                .isInstanceOf(ExternalApiException.class)
                .hasMessageContaining("RAWG_API_KEY");
        noCallServer.verify();   // 기대한 요청이 0건이고 실제도 0건
    }

    /** null들은 RawgProperties의 compact 생성자가 기본값으로 채운다 */
    private RawgProperties properties(String apiKey) {
        return new RawgProperties("https://api.rawg.io/api", apiKey, null, null, 20);
    }
}
