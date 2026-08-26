package com.milobeene.starlog.common.exception;

/**
 * 429 — 지금은 못 받는다. **잠시 뒤에는 된다**는 점이 409(ConflictException)와 다르다.
 *
 * 두 곳에서 난다:
 *   1. IGDB 전역 게이트 — 앱 전체 초당 4건을 넘어 자리를 못 잡았다 (1초 안에 풀린다)
 *   2. 일일 쿼터 — 회원의 하루치를 다 썼다 (자정에 풀린다)
 *
 * 같은 상태코드에 뜻이 둘이라 `code`로 가른다 — 화면이 문구를 다르게 보여야 한다
 */
public class TooManyRequestsException extends RuntimeException {

    private final String code;

    public TooManyRequestsException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
