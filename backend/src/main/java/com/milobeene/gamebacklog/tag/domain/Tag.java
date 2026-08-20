package com.milobeene.gamebacklog.tag.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_tag_member_name",
        columnNames = {"member_id", "name"}))
public class Tag extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(nullable = false, length = 50)
    private String name;

    /**
     * JPA 전용 기본 생성자
     */
    protected Tag() {}

    public Tag(Member member, String name) {
        this.member = member;
        this.name = requireName(name);
    }

    /** 이름 변경 (FR-TAG-02). 기존 이름과의 충돌 검사는 서비스가 한다 — 형제를 봐야 하므로 */
    public void rename(String name) {
        this.name = requireName(name);
    }

    private static String requireName(String name) {
        String normalized = TextValues.normalize(name);
        if (normalized == null) {
            throw new IllegalArgumentException("태그 이름은 비울 수 없습니다");
        }
        return normalized;
    }
}