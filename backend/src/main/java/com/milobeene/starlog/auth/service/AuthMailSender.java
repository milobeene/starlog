package com.milobeene.starlog.auth.service;

/**
 * 메일 발송 포트 (OI-02 결정).
 *
 * 이 페이즈의 알맹이는 토큰의 수명·1회용·해싱이지 SMTP 설정이 아니다.
 * 그래서 인터페이스만 두고 dev·test에서는 로그로 대신한다. 실제 발송 구현은 Phase 9.
 */
public interface AuthMailSender {

    void sendEmailVerification(String email, String rawToken);

    void sendPasswordReset(String email, String rawToken);
}
