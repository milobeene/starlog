package com.milobeene.gamebacklog.platform.domain;

import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.domain.MemberOwnedEntity;
import jakarta.persistence.*;
import lombok.Getter;

/**
 * 입력 방식 (FR-PLT-04). 이름뿐이다.
 *
 * 원래 enum 4개(XINPUT·NINTENDO·PLAYSTATION·KEYBOARD_MOUSE)였는데 테이블로 올렸다 —
 * enum은 값을 늘리려면 배포가 필요하고, 회원마다 쓰는 컨트롤러가 다르다
 */
@Getter
@Entity
@Table(name = "input_method", uniqueConstraints = @UniqueConstraint(
        name = "uk_input_method", columnNames = {"member_id", "name"}))
public class InputMethod extends MemberOwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String name;

    /**
     * JPA 전용 기본 생성자
     */
    protected InputMethod() {}

    public InputMethod(Member member, String name) {
        super(member);
        this.name = TextValues.require(name, "입력 방식 이름은 비울 수 없습니다");
    }

    public void rename(String name) {
        this.name = TextValues.require(name, "입력 방식 이름은 비울 수 없습니다");
    }

    @Override
    public String displayName() {
        return name;
    }
}
