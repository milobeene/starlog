package com.milobeene.starlog.backlog.dto;

import com.milobeene.starlog.common.util.TextValues;
import jakarta.validation.constraints.AssertTrue;

/**
 * 백로그에 담기 (FR-BL-01). 마스터 게임 id 또는 외부 DB id 중 하나를 받는다 (J-3).
 *
 * 검색 결과가 두 종류라서 이렇게 됐다 — 이미 마스터에 있으면 gameId가 실려 오고,
 * 외부 DB에만 있으면 externalId가 온다. 프론트는 검색 응답의 두 필드를 그대로 넘기면 되고,
 * "이미 캐시됐는지"를 판단하지 않는다. 그 판단은 GameResolver가 한다
 */
public record BacklogAddRequest(Long gameId, String externalId) {

    /**
     * 필드 하나로는 표현이 안 되는 규칙 — @NotNull을 둘 다 붙일 수도, 안 붙일 수도 없다.
     *
     * @AssertTrue는 "이 메서드가 true를 반환해야 한다"는 검증이다. Bean Validation이
     * isXxx()를 프로퍼티 xxx로 읽으므로, 실패 메시지의 필드명은 targetPresent가 된다
     */
    @AssertTrue(message = "gameId 또는 externalId 중 하나는 필요합니다")
    public boolean isTargetPresent() {
        return gameId != null || TextValues.normalize(externalId) != null;
    }
}
