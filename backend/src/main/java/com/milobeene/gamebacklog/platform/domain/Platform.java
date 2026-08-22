package com.milobeene.gamebacklog.platform.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_platform_name", columnNames = "name"))
public class Platform extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    /**
     * JPA 전용 기본 생성자
     */
    protected Platform() {}

    public Platform(String name) {
        this.name = name;
    }

    public static Platform of(String name) {
        return new Platform(name);
    }

    /** 이름 수정 (FR-ADM-04). 마스터는 삭제하지 않으므로 오타 정정은 이 경로뿐이다 */
    public void rename(String newName) {
        this.name = newName;
    }
}
