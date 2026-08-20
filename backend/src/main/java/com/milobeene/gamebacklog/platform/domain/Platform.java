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
}
