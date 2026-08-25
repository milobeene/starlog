package com.milobeene.starlog.common.exception;

import lombok.Getter;

/**
 * 409 — 삭제된 행이 이미 있어 되살리기가 가능한 상태 (§7.4).
 * 호출부가 사용자 확인을 받은 뒤 각 서비스의 revive()를 부른다.
 *
 * ConflictException을 상속하는 이유 — 되살리기도 결국 "지금 상태로는 안 됨"이라 409다.
 * 핸들러는 더 구체적인 타입이 이기므로, 이 예외만 targetId·reviveUrl을 실어 보낼 수 있다.
 * 추상 클래스인 이유 — 구체 타입으로 어느 도메인인지 구분한다.
 *
 * 되살리기 URL은 여기 없다 — 라우트는 컨트롤러(웹 계층)의 소유물이라
 * 서비스가 던지는 예외에 URL을 넣으면 서비스가 HTTP를 알게 된다 (NFR-A1 위반).
 * 구체 타입 → 라우트 매핑은 GlobalExceptionHandler가 갖는다
 */
@Getter
public abstract class RevivableException extends ConflictException {

    private final Long targetId;

    protected RevivableException(String message, Long targetId) {
        super(message);
        this.targetId = targetId;
    }
}
