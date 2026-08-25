package com.milobeene.starlog.backlog.dto;

import com.milobeene.starlog.backlog.domain.OverrideCommand;
import com.milobeene.starlog.common.dto.MoneyRequest;

import java.time.LocalDate;
import java.util.List;

/**
 * 오버라이드 전체 교체 (FR-BL-03, 04).
 * 스칼라 null / 리스트 [] = 안 덮어씀 (DTO 설계서 §5.2)
 */
import jakarta.validation.constraints.Size;

public record OverrideUpdateRequest(
        @Size(max = 300) String name,
        List<@Size(max = 200) String> developers,     // 컬렉션 "원소"에 거는 제약
        List<@Size(max = 200) String> publishers,
        LocalDate releasedOn,
        MoneyRequest listPrice
) {

    /** 웹이 도메인을 안다. 도메인은 웹을 모른다 (NFR-A1) */
    public OverrideCommand toCommand() {
        return new OverrideCommand(name, developers, publishers, releasedOn,
                MoneyRequest.toMoney(listPrice));
    }
}
