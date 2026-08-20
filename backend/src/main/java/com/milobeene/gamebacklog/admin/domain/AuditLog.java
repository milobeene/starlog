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
}