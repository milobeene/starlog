package com.milobeene.gamebacklog.auth.service;

import lombok.extern.slf4j.Slf4j;

/**
 * dev·test용 구현. 콘솔에 토큰을 찍는다.
 *
 * **원래 prod에는 구현체를 두지 않았다** — 조용히 아무 메일도 안 보내는 것보다
 * 못 뜨는 편이 낫다는 판단이었다.
 *
 * **폴백 구현이다.** `app.mail.api-key`가 없을 때만 MailConfig가 이걸 고른다.
 * 키가 있으면 ResendAuthMailSender가 실제로 발송한다 (OI-02 해소).
 *
 * ⚠️ 여기로 떨어지면 **토큰이 로그에 그대로 찍힌다.** 운영에서는 키를 반드시 넣을 것
 */
@Slf4j
public class LoggingAuthMailSender implements AuthMailSender {

    @Override
    public void sendEmailVerification(String email, String rawToken) {
        print("이메일 인증", email, rawToken);
    }

    @Override
    public void sendPasswordReset(String email, String rawToken) {
        print("비밀번호 재설정", email, rawToken);
    }

    private void print(String title, String email, String rawToken) {
        // 토큰만 찍으면 손으로 URL을 조립해야 한다. 바로 누를 수 있게 전체 링크를 준다
        String path = title.startsWith("이메일") ? "/verify-email" : "/password-reset/confirm";
        log.info("""

                ─────────────────────────────────────────────
                 {} (콘솔 폴백 — 메일은 나가지 않았습니다)
                 받는 사람 : {}
                 링크      : http://localhost:3000{}?token={}
                ─────────────────────────────────────────────""", title, email, path, rawToken);
    }
}
