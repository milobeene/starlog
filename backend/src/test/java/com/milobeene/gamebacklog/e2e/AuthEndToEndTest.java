package com.milobeene.gamebacklog.e2e;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.gamebacklog.support.CapturingAuthMailSender;
import com.milobeene.gamebacklog.support.CapturingAuthMailSender.Kind;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.io.IOException;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;

/**
 * 인증 흐름 종단 테스트 (I-3T).
 *
 * **왜 MockMvc로는 부족한가** — MockMvc에는 브라우저가 없다. 요청과 요청 **사이**에
 * 브라우저가 하는 일(쿠키 저장·같은 이름 쿠키 덮어쓰기·토큰 회전 추적)이 일어나지 않는다.
 * 게다가 `.with(csrf())` 헬퍼는 토큰 저장소를 통째로 갈아치워
 * "클라이언트가 토큰을 어디서 얻는가"라는 질문 자체를 없앤다.
 *
 * 실제로 이 사각지대에서 같은 계열의 버그를 **세 번** 만났다 —
 * 로그인 성공 / 미인증 거부 / 세션 강제 만료 뒤에 CSRF 토큰이 재발급되지 않아
 * 그다음 쓰기 요청이 전부 403이 되던 문제다. 세 번 다 테스트는 초록불이었다.
 *
 * 그래서 여기서는 진짜 포트를 띄우고 쿠키 저장소를 든 HTTP 클라이언트로 왕복한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(CapturingAuthMailSender.class)
class AuthEndToEndTest {

    @LocalServerPort int port;
    @Autowired CapturingAuthMailSender mailSender;

    private HttpClient client;
    private CookieManager cookies;

    @BeforeEach
    void setUp() {
        mailSender.sent.clear();
        cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        client = HttpClient.newBuilder().cookieHandler(cookies).build();
    }

    @Test
    public void 가입부터_로그아웃까지_브라우저처럼_돈다() throws Exception {
        //given — 아무 GET이나 한 번 보내면 CSRF 토큰 쿠키가 내려온다
        get("/api/me");
        assertThat(csrfToken()).as("토큰을 얻을 경로가 있어야 한다").isNotBlank();

        //when
        String email = "e2e-%d@example.com".formatted(System.nanoTime());
        assertThat(postJson("/api/auth/signup", """
                {"email":"%s","password":"password1234","nickname":"종단"}""".formatted(email))
                .statusCode()).isEqualTo(201);

        String token = mailSender.of(Kind.EMAIL_VERIFICATION).getLast().token();
        assertThat(postJson("/api/auth/email-verification",
                "{\"token\":\"%s\"}".formatted(token)).statusCode()).isEqualTo(204);

        //then
        assertThat(login(email, "password1234").statusCode()).isEqualTo(200);
        assertThat(get("/api/me").statusCode()).as("세션으로 조회").isEqualTo(200);
    }

    /**
     * 세 번 데인 그 버그. 로그아웃은 CSRF 쿠키까지 지우는데,
     * 새 토큰을 안 내려주면 **다음 로그인 요청이 403**이 된다.
     */
    @Test
    public void 로그아웃한_뒤에도_다시_로그인할_수_있다() throws Exception {
        //given
        String email = verifiedMember();
        login(email, "password1234");

        //when
        assertThat(post("/api/auth/logout").statusCode()).isEqualTo(204);

        //then
        assertThat(login(email, "password1234").statusCode())
                .as("로그아웃 뒤 CSRF 토큰이 재발급되지 않으면 여기서 403이 난다").isEqualTo(200);
    }

    /** 미인증 거부(403)도 인증은 통과한 뒤라 토큰이 회전된 상태다 */
    @Test
    public void 미인증_거부_뒤에도_인증_API를_호출할_수_있다() throws Exception {
        //given
        get("/api/me");
        String email = "unverified-%d@example.com".formatted(System.nanoTime());
        postJson("/api/auth/signup", """
                {"email":"%s","password":"password1234","nickname":"미인증"}""".formatted(email));
        String token = mailSender.of(Kind.EMAIL_VERIFICATION).getLast().token();

        //when — 인증 전 로그인 시도
        assertThat(login(email, "password1234").statusCode()).isEqualTo(403);

        //then — 그 직후 인증 요청이 통해야 한다
        assertThat(postJson("/api/auth/email-verification",
                "{\"token\":\"%s\"}".formatted(token)).statusCode())
                .as("거부 응답이 새 토큰을 안 주면 계정이 영영 인증을 못 받는다").isEqualTo(204);
    }

    /** 비밀번호 재설정은 세션을 전부 끊는다. 그 뒤에도 다시 로그인할 수 있어야 한다 */
    @Test
    public void 비밀번호를_재설정하면_기존_세션이_끊기고_새_비번으로_로그인된다() throws Exception {
        //given
        String email = verifiedMember();
        login(email, "password1234");
        assertThat(get("/api/me").statusCode()).isEqualTo(200);

        //when
        assertThat(postJson("/api/auth/password-reset/request",
                "{\"email\":\"%s\"}".formatted(email)).statusCode()).isEqualTo(202);
        String token = mailSender.of(Kind.PASSWORD_RESET).getLast().token();
        assertThat(postJson("/api/auth/password-reset", """
                {"token":"%s","newPassword":"brandNewPassword1"}""".formatted(token))
                .statusCode()).isEqualTo(204);

        //then
        assertThat(get("/api/me").statusCode()).as("기존 세션은 끊긴다").isNotEqualTo(200);
        assertThat(login(email, "password1234").statusCode()).as("옛 비밀번호는 안 된다").isEqualTo(401);
        assertThat(login(email, "brandNewPassword1").statusCode()).isEqualTo(200);
    }

    /** 토큰 없이 보내는 쓰기 요청은 막혀야 한다 — 방어가 실제로 켜져 있는지 */
    @Test
    public void 토큰_없는_쓰기는_403이다() throws Exception {
        //given
        String email = verifiedMember();
        login(email, "password1234");

        //when — 헤더를 일부러 빼고 보낸다
        HttpResponse<String> response = send(HttpRequest.newBuilder(uri("/api/me/profile"))
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString("{\"nickname\":\"바꿔치기\"}")));

        //then
        assertThat(response.statusCode()).isEqualTo(403);
    }

    /* ── 헬퍼 ─────────────────────────────────────────────── */

    private String verifiedMember() throws Exception {
        get("/api/me");
        String email = "v-%d@example.com".formatted(System.nanoTime());
        postJson("/api/auth/signup", """
                {"email":"%s","password":"password1234","nickname":"종단"}""".formatted(email));
        String token = mailSender.of(Kind.EMAIL_VERIFICATION).getLast().token();
        postJson("/api/auth/email-verification", "{\"token\":\"%s\"}".formatted(token));
        return email;
    }

    /** 브라우저가 하는 일 — 쿠키에서 토큰을 꺼내 헤더로 되돌려준다 */
    private String csrfToken() {
        return cookies.getCookieStore().getCookies().stream()
                .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                .map(HttpCookie::getValue)
                .findFirst()
                .orElse("");
    }

    private HttpResponse<String> get(String path) throws Exception {
        return send(HttpRequest.newBuilder(uri(path)).GET());
    }

    private HttpResponse<String> post(String path) throws Exception {
        return send(HttpRequest.newBuilder(uri(path))
                .header("X-XSRF-TOKEN", csrfToken())
                .POST(HttpRequest.BodyPublishers.noBody()));
    }

    private HttpResponse<String> postJson(String path, String body) throws Exception {
        return send(HttpRequest.newBuilder(uri(path))
                .header("Content-Type", "application/json")
                .header("X-XSRF-TOKEN", csrfToken())
                .POST(HttpRequest.BodyPublishers.ofString(body)));
    }

    /** 로그인은 JSON이 아니라 form 형식이다 (폼 로그인) */
    private HttpResponse<String> login(String email, String password) throws Exception {
        return send(HttpRequest.newBuilder(uri("/api/auth/login"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("X-XSRF-TOKEN", csrfToken())
                .POST(HttpRequest.BodyPublishers.ofString(
                        "email=%s&password=%s".formatted(email, password))));
    }

    private HttpResponse<String> send(HttpRequest.Builder builder) throws IOException, InterruptedException {
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    @SuppressWarnings("unused")
    private List<HttpCookie> allCookies() {
        return cookies.getCookieStore().getCookies();
    }
}
