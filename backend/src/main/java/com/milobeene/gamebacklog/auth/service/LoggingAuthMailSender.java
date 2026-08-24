package com.milobeene.gamebacklog.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * dev·test용 구현. 콘솔에 토큰을 찍는다.
 *
 * **원래 prod에는 구현체를 두지 않았다** — 조용히 아무 메일도 안 보내는 것보다
 * 못 뜨는 편이 낫다는 판단이었다.
 *
 * O-3에서 Neon 투입을 막아 prod를 임시로 열었다. 인증 메일이 필요한 건 **비밀번호 가입 경로뿐**이고
 * 실사용은 구글 OAuth라 실질 영향은 없다. 다만 **토큰이 로그에 찍힌다** —
 * 배포 전에 반드시 둘 중 하나로 닫는다:
 *   (a) 실제 SMTP 구현을 붙이고 여기서 prod를 뺀다
 *   (b) 비밀번호 가입을 막고 구글 OAuth만 남긴다 (인증 메일 경로 자체가 사라진다)
 */
@Slf4j
@Component
@Profile({"dev", "test", "prod"})
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
        log.info("""

                ─────────────────────────────────────────────
                 {} (dev)
                 받는 사람 : {}
                 토큰      : {}
                ─────────────────────────────────────────────""", title, email, rawToken);
    }
}
