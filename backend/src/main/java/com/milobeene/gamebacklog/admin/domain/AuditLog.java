package com.milobeene.gamebacklog.admin.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
public class AuditLog extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "actor_id", nullable = false)
    private Member actor;

    @Column(nullable = false, length = 50)
    private String action;   // "MEMBER_LIST_VIEW" 등

    @Column(length = 50)
    private String targetType;

    private Long targetId;

    @Column(length = 50)
    private String requestIp;

    @Column(length = 500)
    private String userAgent;

    /**
     * JPA 전용 기본 생성자
     */
    protected AuditLog() {}

    public AuditLog(Member actor, String action) {
        this.actor = actor;
        this.action = action;
    }

    /** 요청 정보까지 담아 기록한다 (NFR-S8). 컬럼 길이를 넘기면 잘라 넣는다 — 로그 때문에 요청이 실패하면 안 된다 */
    public static AuditLog of(Member actor, String action, String targetType, Long targetId,
                              String requestIp, String userAgent) {
        AuditLog log = new AuditLog(actor, cut(action, 50));
        log.targetType = cut(targetType, 50);
        log.targetId = targetId;
        log.requestIp = cut(requestIp, 50);
        log.userAgent = cut(userAgent, 500);
        return log;
    }

    private static String cut(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}