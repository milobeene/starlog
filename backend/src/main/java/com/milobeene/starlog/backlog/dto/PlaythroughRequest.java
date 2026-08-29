package com.milobeene.starlog.backlog.dto;

import com.milobeene.starlog.backlog.domain.PlaythroughCommand;
import com.milobeene.starlog.backlog.domain.PlaythroughStatus;

import java.time.LocalDate;

/** 회차 추가·수정 공용 (FR-PT-01~07). 수정도 전체 교체다 */
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PlaythroughRequest(
        @NotNull LocalDate startedOn,
        LocalDate finishedOn,      // null = 진행 중
        @NotNull PlaythroughStatus status,
        Long deviceId,
        /** 플랫폼 또는 에뮬레이터 중 하나 (v1.1). 화면의 토글이 정한다 */
        Long platformId,
        Long platformAccountId,
        Long emulatorId,
        Long inputMethodId,        // enum이던 시절엔 문자열이었다 (V2에서 테이블로 승격)
        @Size(max = 100) String label
) {

    public PlaythroughCommand toCommand() {
        return new PlaythroughCommand(startedOn, finishedOn, status,
                deviceId, platformId, platformAccountId, emulatorId, inputMethodId, label);
    }
}
