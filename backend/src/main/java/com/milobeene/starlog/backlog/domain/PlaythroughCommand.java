package com.milobeene.starlog.backlog.domain;

import java.time.LocalDate;

/** 회차 입력값 묶음. 추가·수정이 같은 형태를 쓴다 */
public record PlaythroughCommand(
        LocalDate startedOn,
        LocalDate finishedOn,      // null = 진행 중
        PlaythroughStatus status,
        Long deviceId,
        /** 어디서 했나 (v1.1). 에뮬레이터와 동시에 오지 않는다 */
        Long platformId,
        Long platformAccountId,
        Long emulatorId,
        Long inputMethodId,
        String label
) {
}
