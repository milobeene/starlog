package com.milobeene.gamebacklog.admin.dto;

import com.milobeene.gamebacklog.admin.domain.AuditLog;

import java.time.LocalDateTime;

/** 감사 로그 한 줄 (FR-ADM-05) */
public record AuditLogResponse(
        Long auditLogId,
        Long actorId,
        String actorEmail,
        String action,
        String targetType,
        Long targetId,
        String requestIp,
        String userAgent,
        LocalDateTime occurredAt) {

    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(
                log.getId(),
                log.getActor().getId(),
                log.getActor().getEmail(),
                log.getAction(),
                log.getTargetType(),
                log.getTargetId(),
                log.getRequestIp(),
                log.getUserAgent(),
                log.getCreatedAt());
    }
}
