package com.milobeene.gamebacklog.member.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Entity
@Table(name = "member")   // MEMBER는 일부 DB에서 예약어. 명시해두면 안전
public class Member extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 320)
    private String email;

    @Column(length = 100)
    private String password;          // 소셜 전용 계정은 null

    @Column(nullable = false, length = 30)
    private String nickname;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MemberRole role;

    @Column(nullable = false)
    private boolean emailVerified;

    @Column(unique = true, length = 100)
    private String googleSubject;

    private LocalDateTime deletedAt;

    /**
     * JPA 전용 기본 생성자
     */
    protected Member() {}

    public static Member signUpWithEmail(String email, String encodedPassword, String nickname) {
        Member member = new Member();
        member.email = email;
        member.password = encodedPassword;
        member.nickname = nickname;
        member.role = MemberRole.USER;
        member.emailVerified = false;
        return member;
    }
}