package com.milobeene.starlog.tag.domain;

import com.milobeene.starlog.common.entity.BaseEntity;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.member.domain.Member;
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
     * 화면에 보이는 순서 (v1.1).
     *
     * 사전에서 드래그로 정하고 **사이드바와 폴더 탭이 이걸 따른다.** 값 자체에 뜻은 없고
     * 작을수록 앞이라는 것만 약속이다 — 사이를 비워두지 않고 0부터 촘촘히 다시 매긴다.
     * 촘촘히 매기면 한 번 옮길 때 그 회원의 태그를 전부 갱신해야 하지만,
     * 개인 앱에서 태그는 많아야 수십 개라 그 비용이 사이 값을 관리하는 복잡도보다 싸다
     */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

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

    /** 순서만 바꾼다. 이름은 건드리지 않는다 */
    public void moveTo(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    private static String requireName(String name) {
        String normalized = TextValues.normalize(name);
        if (normalized == null) {
            throw new InvalidInputException("태그 이름은 비울 수 없습니다");
        }
        return normalized;
    }
}