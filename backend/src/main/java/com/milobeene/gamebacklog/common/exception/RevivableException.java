package com.milobeene.gamebacklog.common.exception;

import lombok.Getter;

/**
 * 409 — 삭제된 행이 이미 있어 되살리기가 가능한 상태 (§7.4).
 * 호출부가 사용자 확인을 받은 뒤 각 서비스의 revive()를 부른다.
 *
 * ConflictException을 상속하는 이유 — 되살리기도 결국 "지금 상태로는 안 됨"이라 409다.
 * 핸들러는 더 구체적인 타입이 이기므로, 이 예외만 targetId·reviveUrl을 실어 보낼 수 있다.
 * 추상 클래스인 이유 — 구체 타입으로 어느 도메인인지 구분한다
 */
@Getter
public abstract class RevivableException extends ConflictException {

    private final Long targetId;

    protected RevivableException(String message, Long targetId) {
        super(message);
        this.targetId = targetId;
    }

    /** 확인 후 호출할 되살리기 경로. 응답에 그대로 실린다 */
    public abstract String reviveUrl();
}
