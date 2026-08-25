package com.milobeene.starlog.auth.service;

import com.resend.Resend;
import com.resend.services.emails.model.CreateEmailOptions;
import lombok.extern.slf4j.Slf4j;

/**
 * 실제 발송 구현 (OI-02 — Resend).
 *
 * SMTP가 아니라 **HTTP API**를 쓰는 이유 — 배포처(Render 무료 티어 등)가 아웃바운드 25/587번
 * 포트를 막는 경우가 흔하다. HTTPS로 나가면 그 제약을 안 탄다.
 *
 * ⚠️ **테스트 도메인(`onboarding@resend.dev`)은 계정 소유자 주소로만 발송된다.**
 * 다른 사람에게 보내려면 Resend에 도메인을 등록하고 `app.mail.from`을 그 도메인으로 바꿔야 한다.
 *
 * **발송 실패를 던지지 않는다.** 예전에는 던졌는데, 발송이 가입 트랜잭션 안에서 일어나
 * 메일 한 통 실패에 회원 생성까지 통째로 롤백됐다 — 가입이 본질이고 메일은 부수 작업이다.
 * 실패하면 로그에 링크를 남겨 재발송·수동 인증 경로를 열어 둔다
 */
@Slf4j
public class ResendAuthMailSender implements AuthMailSender {

    private final Resend resend;
    private final MailProperties properties;

    public ResendAuthMailSender(MailProperties properties) {
        this.properties = properties;
        this.resend = new Resend(properties.apiKey());
    }

    @Override
    public void sendEmailVerification(String email, String rawToken) {
        String url = link("/verify-email", rawToken);
        send(email, "[STARLOG] 이메일 인증을 완료해 주세요",
                body("이메일 인증",
                        "아래 버튼을 누르시면 인증이 완료되어 로그인하실 수 있습니다.",
                        "인증 완료하기", url,
                        "링크는 24시간 동안 유효합니다."),
                url);
    }

    @Override
    public void sendPasswordReset(String email, String rawToken) {
        String url = link("/password-reset/confirm", rawToken);
        send(email, "[STARLOG] 비밀번호 재설정 안내",
                body("비밀번호 재설정",
                        "아래 버튼을 누르시면 새 비밀번호를 설정하실 수 있습니다.",
                        "비밀번호 재설정", url,
                        "링크는 30분 동안 유효합니다. 요청하지 않으셨다면 이 메일을 무시해 주세요."),
                url);
    }

    private String link(String path, String rawToken) {
        return properties.frontendBaseUrl() + path + "?token=" + rawToken;
    }

    private void send(String to, String subject, String html, String url) {
        try {
            resend.emails().send(CreateEmailOptions.builder()
                    .from(properties.from())
                    .to(to)
                    .subject(subject)
                    .html(html)
                    .build());
        } catch (Exception e) {
            /*
             * 삼킨다. 던지면 가입 트랜잭션이 롤백돼 회원이 안 만들어진다.
             * 대신 링크를 로그에 남긴다 — 안 그러면 토큰을 되찾을 방법이 없다
             * (원문은 저장하지 않는다, NFR-S2)
             */
            log.warn("""
                    인증 메일 발송 실패 — to={}, reason={}
                    ─────────────────────────────────────────────
                     수동 링크 : {}
                    ─────────────────────────────────────────────""", to, e.getMessage(), url);
        }
    }

    /** 메일 클라이언트는 외부 CSS를 안 읽는다 — 인라인 스타일로만 짠다 */
    private String body(String title, String lead, String cta, String url, String note) {
        return """
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                            max-width:480px;margin:0 auto;padding:40px 24px;color:#111">
                  <div style="font-size:13px;letter-spacing:.25em;font-weight:700;color:#555">STARLOG</div>
                  <h1 style="font-size:20px;margin:24px 0 8px">%s</h1>
                  <p style="font-size:14px;line-height:1.7;color:#444;margin:0 0 28px">%s</p>
                  <a href="%s" style="display:inline-block;background:#111;color:#fff;text-decoration:none;
                     padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600">%s</a>
                  <p style="font-size:12px;color:#888;margin:28px 0 0">%s</p>
                  <p style="font-size:11px;color:#aaa;margin:16px 0 0;word-break:break-all">
                    버튼이 눌리지 않으면 이 주소를 복사해 주세요<br>%s</p>
                </div>"""
                .formatted(title, lead, url, cta, note, url);
    }
}
