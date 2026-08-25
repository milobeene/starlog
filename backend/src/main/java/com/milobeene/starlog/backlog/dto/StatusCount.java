package com.milobeene.starlog.backlog.dto;

import com.milobeene.starlog.backlog.domain.BacklogStatus;

/** 상태별 항목 수 */
public record StatusCount(BacklogStatus status, long count) {
}
