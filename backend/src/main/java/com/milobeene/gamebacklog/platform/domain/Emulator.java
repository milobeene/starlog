package com.milobeene.gamebacklog.platform.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;

@Entity
@Getter
@Table(
        name = "emulator",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_emulator_name", columnNames = "name"
        )
)
public class Emulator extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    protected Emulator() {}

    public Emulator(String name) {
        this.name = name;
    }

    public static Emulator of(String name) {
        return new Emulator(name);
    }
}