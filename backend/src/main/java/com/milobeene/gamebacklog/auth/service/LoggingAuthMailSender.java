package com.milobeene.gamebacklog.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * dev·test용 구현. 콘솔에 토큰을 찍는다.
 *
 * **prod 프로필에는 구현체가 없어서 기동에 실패한다. 의도한 것이다** —
 * 조용히 아무 메일도 안 보내는 것보다 못 뜨는 편이 낫다. Phase 9에서 실제 구현을 붙인다.
 */
@Slf4j
@Component
@Profile({"dev", "test"})
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
