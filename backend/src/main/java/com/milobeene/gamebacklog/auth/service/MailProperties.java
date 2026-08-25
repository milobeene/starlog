package com.milobeene.gamebacklog.auth.service;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 인증 메일 설정 (OI-02 — Resend).
 *
 * `frontendBaseUrl`이 여기 있는 이유 — 메일에 넣을 링크는 **프론트 주소**다.
 * 서버는 토큰만 알고, 그 토큰을 어느 화면이 처리하는지는 프론트가 정한다
 */
@ConfigurationProperties(prefix = "app.mail")
public record MailProperties(String apiKey, String from, String frontendBaseUrl) {

    public MailProperties {
        from = (from == null || from.isBlank()) ? "onboarding@resend.dev" : from;
        frontendBaseUrl = (frontendBaseUrl == null || frontendBaseUrl.isBlank())
                ? "http://localhost:3000" : frontendBaseUrl;
    }

    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
