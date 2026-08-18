package com.milobeene.gamebacklog.platform.domain;

import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
public class Platform {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String name;

    /**
     * JPA 전용 기본 생성자
     */
    protected Platform() {}

    public Platform(String name) {
        this.name = name;
    }
}
