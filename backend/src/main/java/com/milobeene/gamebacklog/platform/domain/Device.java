package com.milobeene.gamebacklog.platform.domain;

import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.domain.MemberOwnedEntity;
import jakarta.persistence.*;
import lombok.Getter;

/**
 * 내 기기 (FR-PLT-03).
 *
 * 마스터에서 기종을 고르는 게 아니라 **유형과 라벨을 직접 적는다.**
 * 유형("Windows PC")은 같은 종류끼리 묶어 보기 위한 것이고,
 * 라벨("메인 윈도우")이 기기의 정체성이다 — 같은 기종을 여러 대 가질 수 있으므로
 * 유니크 제약도 라벨에 걸린다
 */
@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_device", columnNames = {"member_id", "label"}))
public class Device extends MemberOwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "device_type", nullable = false, length = 50)
    private String deviceType;   // "Windows PC", "Nintendo Switch"

    @Column(nullable = false, length = 50)
    private String label;        // "메인 윈도우", "거실 스위치"

    @Column(columnDefinition = "TEXT")
    private String memo;         // 스펙·주의점. 마크다운

    /**
     * JPA 전용 기본 생성자
     */
    protected Device() {}

    public Device(Member member, String deviceType, String label, String memo) {
        super(member);
        apply(deviceType, label, memo);
    }

    public void update(String deviceType, String label, String memo) {
        apply(deviceType, label, memo);
    }

    @Override
    public String displayName() {
        return label;
    }

    /** 선택지에 찍히는 이름. 라벨만으로는 어떤 기종인지 모를 수 있어 유형을 괄호로 덧붙인다 */
    public String optionLabel() {
        return label.equals(deviceType) ? label : label + " (" + deviceType + ")";
    }

    private void apply(String deviceType, String label, String memo) {
        this.deviceType = TextValues.require(deviceType, "기기 유형은 비울 수 없습니다");
        this.label = TextValues.require(label, "기기 라벨은 비울 수 없습니다");
        this.memo = TextValues.normalize(memo);
    }
}
