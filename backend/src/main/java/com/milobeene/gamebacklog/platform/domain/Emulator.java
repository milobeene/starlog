package com.milobeene.gamebacklog.platform.domain;

import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.domain.MemberOwnedEntity;
import jakarta.persistence.*;
import lombok.Getter;

/** 에뮬레이터 (FR-PLT-04). 기기처럼 설정·주의점을 마크다운 메모로 남긴다 */
@Getter
@Entity
@Table(name = "emulator", uniqueConstraints = @UniqueConstraint(
        name = "uk_emulator", columnNames = {"member_id", "name"}))
public class Emulator extends MemberOwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String memo;

    /**
     * JPA 전용 기본 생성자
     */
    protected Emulator() {}

    public Emulator(Member member, String name, String memo) {
        super(member);
        apply(name, memo);
    }

    public void update(String name, String memo) {
        apply(name, memo);
    }

    @Override
    public String displayName() {
        return name;
    }

    private void apply(String name, String memo) {
        this.name = TextValues.require(name, "에뮬레이터 이름은 비울 수 없습니다");
        this.memo = TextValues.normalize(memo);
    }
}
