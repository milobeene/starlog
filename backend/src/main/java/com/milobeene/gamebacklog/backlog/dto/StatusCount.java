package com.milobeene.gamebacklog.backlog.dto;

import com.milobeene.gamebacklog.backlog.domain.BacklogStatus;

/** 상태별 항목 수 */
public record StatusCount(BacklogStatus status, long count) {
}
