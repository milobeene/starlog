package com.milobeene.starlog.game.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.milobeene.starlog.common.exception.ExternalApiException;
import java.time.Duration;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * 토큰 캐시·갱신 (J-7-3).
 *
 * RAWG에는 없던 계층이라 검증할 게 생겼다 — **"몇 번 발급받았나"가 곧 캐시 동작이다.**
 * MockRestServiceServer는 기대한 횟수보다 많이 오면 그 자리에서 실패하므로,
 * `once()`로 선언한 뒤 두 번 호출해보면 캐시가 안 먹었을 때 바로 드러난다
 */
class IgdbTokenProviderTest {

    private static final String TOKEN_BODY = """
            {"access_token": "tok-1", "expires_in": 5555362, "token_type": "bearer"}""";

    @Test
    public void 첫_호출에_발급하고_두_번째부터는_캐시를_쓴다() {
        //given
        RestClient.Builder builder = RestClient.builder().baseUrl("https://id.twitch.tv/oauth2/token");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(once(), requestTo(Matchers.containsString("oauth2/token")))
                .andExpect(method(HttpMethod.POST))
                .andExpect(queryParam("grant_type", "client_credentials"))
                .andExpect(queryParam("client_id", "cid"))
                .andRespond(withSuccess(TOKEN_BODY, MediaType.APPLICATION_JSON));

        IgdbTokenProvider provider = new IgdbTokenProvider(builder.build(), properties(null));

        //when
        String first = provider.token();
        String second = provider.token();

        //then — 두 번째는 네트워크를 타지 않는다. once()가 그걸 보증한다
        assertThat(first).isEqualTo("tok-1");
        assertThat(second).isEqualTo("tok-1");
        server.verify();
    }

    @Test
    public void 만료가_임박하면_다시_받는다() {
        //given — 유효기간(약 64일)보다 갱신 여유를 크게 잡으면 항상 "임박" 상태가 된다
        RestClient.Builder builder = RestClient.builder().baseUrl("https://id.twitch.tv/oauth2/token");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        for (int i = 0; i < 2; i++) {
            server.expect(requestTo(Matchers.containsString("oauth2/token")))
                    .andRespond(withSuccess(TOKEN_BODY, MediaType.APPLICATION_JSON));
        }

        IgdbTokenProvider provider =
                new IgdbTokenProvider(builder.build(), properties(Duration.ofDays(365)));

        //when
        provider.token();
        provider.token();

        //then — 캐시가 있어도 갱신 여유 안에 들면 새로 받는다
        server.verify();
    }

    @Test
    public void forceRefresh는_캐시를_버리고_새로_받는다() {
        //given — 401을 받은 HttpIgdbClient가 부르는 경로
        RestClient.Builder builder = RestClient.builder().baseUrl("https://id.twitch.tv/oauth2/token");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        for (int i = 0; i < 2; i++) {
            server.expect(requestTo(Matchers.containsString("oauth2/token")))
                    .andRespond(withSuccess(TOKEN_BODY, MediaType.APPLICATION_JSON));
        }

        IgdbTokenProvider provider = new IgdbTokenProvider(builder.build(), properties(null));

        //when
        provider.token();
        provider.forceRefresh();

        //then
        server.verify();
    }

    @Test
    public void 자격증명이_없으면_호출조차_하지_않는다() {
        //given
        RestClient.Builder builder = RestClient.builder().baseUrl("https://id.twitch.tv/oauth2/token");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

        IgdbTokenProvider provider = new IgdbTokenProvider(builder.build(),
                new IgdbProperties(null, null, null, null, null, null, 20, null, null, null, null));

        //when //then
        assertThatThrownBy(provider::token)
                .isInstanceOf(ExternalApiException.class)
                .hasMessageContaining("client-id");
        server.verify();   // 기대 0건, 실제 0건
    }

    @Test
    public void 발급이_실패하면_ExternalApiException이다() {
        //given
        RestClient.Builder builder = RestClient.builder().baseUrl("https://id.twitch.tv/oauth2/token");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(Matchers.containsString("oauth2/token")))
                .andRespond(withServerError());

        IgdbTokenProvider provider = new IgdbTokenProvider(builder.build(), properties(null));

        //when //then — 스프링의 RestClientException이 밖으로 새지 않는다
        assertThatThrownBy(provider::token).isInstanceOf(ExternalApiException.class);
    }

    private IgdbProperties properties(java.time.Duration renewMargin) {
        return new IgdbProperties(null, "https://id.twitch.tv/oauth2/token", "cid", "secret",
                null, null, 20, renewMargin, Duration.ZERO, Duration.ZERO, null);
    }
}
