package com.milobeene.gamebacklog.platform.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_device_name", columnNames = "name"))
public class Device extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    /**
     * JPA 전용 기본 생성자
     */
    protected Device() {}

    public Device(String name) {
        this.name = name;
    }

    public static Device of(String name) {
        return new Device(name);
    }

    /** 이름 수정 (FR-ADM-04). 마스터는 삭제하지 않으므로 오타 정정은 이 경로뿐이다 */
    public void rename(String newName) {
        this.name = newName;
    }
}
