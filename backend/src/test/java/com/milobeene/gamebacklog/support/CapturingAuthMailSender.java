package com.milobeene.gamebacklog.support;

import com.milobeene.gamebacklog.auth.service.AuthMailSender;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.util.ArrayList;
import java.util.List;

/**
 * 발송 포트를 가로채는 테스트 구현.
 *
 * 토큰 원문은 DB에 없다(해시만 저장). 실제 사용자가 메일로 받는 것과 같은 경로로 원문을 얻는다.
 * @Primary로 dev·test 로그 구현을 밀어낸다.
 */
@TestConfiguration
public class CapturingAuthMailSender implements AuthMailSender {

    public enum Kind { EMAIL_VERIFICATION, PASSWORD_RESET }

    public record Sent(Kind kind, String email, String token) {}

    public final List<Sent> sent = new ArrayList<>();

    @Override
    public void sendEmailVerification(String email, String rawToken) {
        sent.add(new Sent(Kind.EMAIL_VERIFICATION, email, rawToken));
    }

    @Override
    public void sendPasswordReset(String email, String rawToken) {
        sent.add(new Sent(Kind.PASSWORD_RESET, email, rawToken));
    }

    public List<Sent> of(Kind kind) {
        return sent.stream().filter(message -> message.kind() == kind).toList();
    }

    @Bean
    @Primary
    AuthMailSender capturingAuthMailSender() {
        return this;
    }
}
