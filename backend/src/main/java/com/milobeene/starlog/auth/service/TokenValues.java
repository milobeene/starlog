package com.milobeene.starlog.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * 인증·재설정 토큰의 생성과 해싱 (NFR-S2).
 *
 * 비밀번호와 달리 **BCrypt를 쓰지 않는다.** 이유가 두 가지다.
 *  1) 조회 불가 — BCrypt는 매번 다른 salt를 써서 같은 토큰도 해시가 매번 다르다.
 *     "이 해시로 찾아와"가 성립하지 않는다
 *  2) 느릴 이유가 없음 — 비밀번호는 사람이 만들어 추측 가능하지만, 토큰은 256비트 난수다.
 *     대입으로 맞힐 수 없으므로 일부러 느리게 만들 필요가 없다
 */
final class TokenValues {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int BYTES = 32;   // 256비트

    private TokenValues() {}

    /** 메일 링크에 실리므로 URL에 안전한 문자만 쓴다 */
    static String generate() {
        byte[] buffer = new byte[BYTES];
        RANDOM.nextBytes(buffer);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buffer);
    }

    static String hash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            // SHA-256은 모든 JVM이 반드시 지원한다. 여기 오면 환경이 깨진 것이다
            throw new IllegalStateException("SHA-256을 쓸 수 없습니다", e);
        }
    }
}
