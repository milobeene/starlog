package com.milobeene.gamebacklog.common.exception;

/**
 * 400 — 입력값이 규칙을 어겼다. 범위 위반, 필수값 누락, 서로 모순되는 조합.
 *
 * 엔티티가 자기 불변식을 지키다 던지는 것도 여기다.
 * "이 값 하나만 보면 판단되는 것"이라는 뜻이며, 다른 행을 봐야 알 수 있는 충돌은 ConflictException이다
 */
public class InvalidInputException extends RuntimeException {

    public InvalidInputException(String message) {
        super(message);
    }

    public InvalidInputException(String message, Throwable cause) {
        super(message, cause);
    }
}
