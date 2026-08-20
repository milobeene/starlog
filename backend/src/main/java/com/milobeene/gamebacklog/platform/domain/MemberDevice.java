package com.milobeene.gamebacklog.platform.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.*;
import lombok.Getter;

// 보유 기기 — 입력 편의용이지 제약이 아니다 (BR-PT-05)
@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_member_device",
        columnNames = {"member_id", "device_id", "label"}))
public class MemberDevice extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "device_id", nullable = false)
    private Device device;

    @Column(nullable = false, length = 50)
    private String label;   // "한성컴퓨터 조립 PC" — 같은 기종 복수 보유 대비

    @Column(columnDefinition = "TEXT")
    private String memo;    // 스펙, 주변기기 등 자유 기록

    /**
     * JPA 전용 기본 생성자
     */
    protected MemberDevice() {}

    public MemberDevice(Member member, Device device, String label) {
        this.member = member;
        this.device = device;
        this.label = normalizeLabel(label);
    }

    /** 라벨 변경 — 같은 기종을 여러 대 보유할 때 구분용 (§6.5) */
    public void rename(String label) {
        this.label = normalizeLabel(label);
    }

    public void updateMemo(String memo) {
        this.memo = TextValues.normalize(memo);
    }

    /**
     * label은 유니크 제약(member, device, label)의 일부라 null 대신 빈 문자열로 수렴시킨다.
     * null이면 DB가 중복으로 보지 않기 때문.
     * public static인 이유 — 서비스가 변경 전 중복 검증을 할 때 같은 규칙으로 정규화해야 한다
     */
    public static String normalizeLabel(String label) {
        String normalized = TextValues.normalize(label);
        return (normalized == null) ? "" : normalized;
    }
}