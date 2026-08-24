package com.milobeene.gamebacklog.stats.dto;

import java.util.List;

/**
 * 플레이 시간 (FR-STAT-03).
 *
 * totalHours는 기록된 항목만의 합이다. recordedEntries를 같이 주는 이유 —
 * "총 300시간"만 보면 전체를 다 기록한 것처럼 읽힌다. 분모를 밝힌다
 */
public record PlaytimeStats(
        long totalHours,
        long recordedEntries,
        List<Entry> top
) {

    public record Entry(Long entryId, String displayName, int hours) {}
}
