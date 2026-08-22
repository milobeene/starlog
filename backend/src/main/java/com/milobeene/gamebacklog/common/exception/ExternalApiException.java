package com.milobeene.gamebacklog.common.exception;

/**
 * 502 — 외부 API가 응답하지 않거나 이해할 수 없는 응답을 줬다 (FR-SYS-04).
 *
 * 500이 아닌 이유 — 우리 코드가 터진 게 아니라 **의존하는 쪽**이 터진 것이다.
 * 사용자에게는 "잠시 후 다시" 가 맞는 안내고, 500이면 우리 버그를 찾으러 간다.
 * 이 예외가 나가면 어떤 것도 저장되지 않은 상태여야 한다 — 부분 저장 금지
 */
public class ExternalApiException extends RuntimeException {

    public ExternalApiException(String message) {
        super(message);
    }

    public ExternalApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
