package com.milobeene.gamebacklog.auth.web;

import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * 구글 인증 결과를 **프론트 화면으로 되돌려 보낸다.**
 *
 * 예전에는 JSON을 그대로 썼는데, OAuth는 브라우저 통째 이동이라
 * 사용자에게 `{"code":"LINKED"}` 같은 원문이 그대로 보였다.
 * 결과 코드만 쿼리로 넘기고 문구는 화면이 고른다 — 서버가 UI 문구를 들고 있을 이유가 없다
 */
public final class OAuthRedirects {

    private OAuthRedirects() {}

    /** 로그인·가입 성공 — 대시보드로 */
    public static void toApp(HttpServletResponse response, String frontendBaseUrl, String path)
            throws IOException {
        response.sendRedirect(frontendBaseUrl + path);
    }

    /** 결과 코드를 실어 보낸다. `?google=LINKED` 처럼 화면이 읽어 배너를 띄운다 */
    public static void withResult(HttpServletResponse response, String frontendBaseUrl,
                                  String path, String code) throws IOException {
        response.sendRedirect(frontendBaseUrl + path + "?google="
                + URLEncoder.encode(code, StandardCharsets.UTF_8));
    }
}
