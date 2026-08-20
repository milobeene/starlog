package com.milobeene.gamebacklog.backlog.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Getter
@Entity
@Table(indexes = @Index(
        name = "idx_snapshot_target",
        columnList = "target_type, target_id, created_at"))
public class EntitySnapshot extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name = "target_type", nullable = false, length = 20)
    private SnapshotTarget targetType;

    // FK가 아니다 — 대상이 2종(BacklogEntry/Playthrough)이라 DB 제약을 걸 수 없다 (초안 ⚠️7)
    // §7.5 "복원은 실패할 수 있다"와 직결
    @Column(name = "target_id", nullable = false)
    private Long targetId;

    // 엔티티 상태 전체 JSON. 연관은 ID만 직렬화 (§7.5)
    @Column(nullable = false, columnDefinition = "TEXT")
    private String payload;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "changed_by", nullable = false)
    private Member changedBy;

    /**
     * JPA 전용 기본 생성자
     */
    protected EntitySnapshot() {}

    public EntitySnapshot(SnapshotTarget targetType, Long targetId, String payload, Member changedBy) {
        this.targetType = targetType;
        this.targetId = targetId;
        this.payload = payload;
        this.changedBy = changedBy;
    }
}