package com.milobeene.starlog.platform.service;

import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.member.domain.MemberOwnedEntity;

import java.util.Optional;

/**
 * 선택지 5종이 똑같이 반복하는 두 검사.
 *
 * **남의 것을 못 만지게 하는 게 핵심이다.** id만 바꿔 요청하면 남의 기기 이름을 바꿀 수 있으므로
 * "없음"과 "남의 것"을 같은 404로 뭉갠다 — 존재 여부조차 알려주지 않는다 (NFR-S7)
 */
final class OwnedCatalog {

    private OwnedCatalog() {}

    /** 삭제된 것도 돌려준다. 과거 기록에 붙은 항목을 읽을 때 필요하다 */
    static <T extends MemberOwnedEntity> T require(Optional<T> found, Long memberId, String message) {
        return found.filter(entity -> entity.isOwnedBy(memberId))
                .orElseThrow(() -> new NotFoundException(message));
    }

    /** 수정·삭제 대상. 이미 지운 것을 또 만지려는 요청을 여기서 끊는다 */
    static <T extends MemberOwnedEntity> T requireAlive(Optional<T> found, Long memberId, String message) {
        T entity = require(found, memberId, message);
        if (entity.isDeleted()) {
            throw new ConflictException("이미 삭제되었습니다: " + entity.displayName());
        }
        return entity;
    }
}
