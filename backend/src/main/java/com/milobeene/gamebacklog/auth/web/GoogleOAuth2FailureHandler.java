package com.milobeene.gamebacklog.auth.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 구글 인증 실패.
 *
 * **응답에는 이유를 안 담고 로그에만 남긴다.** 실패 사유가 밖으로 나가면 어떤 조건이
 * 통과하는지 탐색할 단서를 주게 된다 — 로그인 실패를 뭉뚱그리는 것과 같은 이유다 (NFR-S3).
 * 대신 개발자는 콘솔에서 원인을 볼 수 있어야 한다. 이게 없으면 "왜 실패했지"를 알 방법이 없다.
 *
 * 자주 보게 될 사유:
 *  · `authorization_request_not_found` — 콜백 URL을 새로고침했다. code는 1회용이다
 *  · `invalid_client`                  — client-id/secret이 틀렸다
 *  · `redirect_uri_mismatch`           — 콘솔에 등록한 리디렉션 URI와 다르다
 *  · `access_denied`                   — 사용자가 동의를 거부했거나 테스트 사용자 목록에 없다
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GoogleOAuth2FailureHandler implements AuthenticationFailureHandler {

    private final CsrfTokenIssuer csrfTokenIssuer;

    @Override
    public void onAuthenticationFailure(HttpServletRequest request, HttpServletResponse response,
                                        AuthenticationException exception) throws IOException {
        logReason(exception);

        // 실패해도 토큰은 회전됐을 수 있다. 안 주면 다음 시도가 403이 된다 (I-3~I-7에서 세 번 겪은 함정)
        csrfTokenIssuer.issueFresh(request, response);

        JsonErrors.write(response, HttpStatus.UNAUTHORIZED.value(),
                "GOOGLE_AUTH_FAILED", "구글 인증에 실패했습니다");
    }

    private void logReason(AuthenticationException exception) {
        if (exception instanceof OAuth2AuthenticationException oauth2Exception) {
            log.warn("구글 인증 실패 — code={}, description={}",
                    oauth2Exception.getError().getErrorCode(),
                    oauth2Exception.getError().getDescription());
        } else {
            log.warn("구글 인증 실패", exception);
        }
    }
}
