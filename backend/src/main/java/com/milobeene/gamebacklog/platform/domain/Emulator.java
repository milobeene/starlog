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

    /** 이름 수정 (FR-ADM-04). 마스터는 삭제하지 않으므로 오타 정정은 이 경로뿐이다 */
    public void rename(String newName) {
        this.name = newName;
    }
}