package com.milobeene.gamebacklog.common.exception;

/**
 * 409 — 지금 상태로는 할 수 없는 요청이다.
 *
 * 중복(이미 담은 게임, 같은 라벨), 상태 충돌(삭제된 항목 수정, 진행 중 회차 2개),
 * 다른 행을 봐야 판단되는 규칙 위반(BR-PT-02·03)이 여기 속한다
 */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
