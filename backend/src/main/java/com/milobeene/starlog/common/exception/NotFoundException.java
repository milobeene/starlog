package com.milobeene.starlog.common.exception;

/**
 * 404 — 대상이 없다.
 *
 * **내 것이 아닌 경우에도 이 예외를 쓴다.** 403으로 답하면 "그 id는 존재한다"가
 * 새어나가기 때문이다 (NFR-S7). 메시지도 "없음"과 같게 유지한다
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
