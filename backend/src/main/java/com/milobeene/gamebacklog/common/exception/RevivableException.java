package com.milobeene.gamebacklog.common.exception;

import lombok.Getter;

/**
 * 삭제된 행이 이미 있어 되살리기가 가능한 상태 (§7.4).
 * 호출부가 사용자 확인을 받은 뒤 각 서비스의 revive()를 부른다.
 *
 * 추상 클래스로 둔 이유 — Phase 2(H-5)에서 @ExceptionHandler(RevivableException.class)
 * 하나로 되살리기 계열을 전부 409 + "복원할까요?"로 번역하면서도,
 * 구체 타입으로 어느 도메인인지 구분할 수 있다
 */
@Getter
public abstract class RevivableException extends RuntimeException {

    private final Long targetId;

    protected RevivableException(String message, Long targetId) {
        super(message);
        this.targetId = targetId;
    }
}
