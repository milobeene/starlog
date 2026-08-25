package com.milobeene.starlog.platform.domain;

import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.domain.MemberOwnedEntity;
import jakarta.persistence.*;
import lombok.Getter;

/** 플랫폼 (FR-PLT-04). 이름뿐이다 — 계정이 여기에 매달린다 */
@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_platform", columnNames = {"member_id", "name"}))
public class Platform extends MemberOwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    /**
     * JPA 전용 기본 생성자
     */
    protected Platform() {}

    public Platform(Member member, String name) {
        super(member);
        this.name = TextValues.require(name, "플랫폼 이름은 비울 수 없습니다");
    }

    /** 이름을 바꾸면 이 플랫폼을 문 계정·취득이 **전부 따라 바뀐다.** FK라 값을 복사해두지 않았다 */
    public void rename(String name) {
        this.name = TextValues.require(name, "플랫폼 이름은 비울 수 없습니다");
    }

    @Override
    public String displayName() {
        return name;
    }
}
