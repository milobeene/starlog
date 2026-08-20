package com.milobeene.gamebacklog.member.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.util.TextValues;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Getter
@Entity
@Table(name = "member",/*MEMBER는 일부 DB에서 예약어. 명시해두면 안전*/
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_member_email", columnNames = "email"),
                @UniqueConstraint(name = "uk_member_google_subject", columnNames = "google_subject")
        },
        indexes = @Index(name = "idx_member_deleted_at", columnList = "deleted_at"))
public class Member extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 320)
    private String email;

    @Column(length = 100)
    private String password;          // 소셜 전용 계정은 null

    @Column(nullable = false, length = 30)
    private String nickname;

    @Column(columnDefinition = "TEXT")
    private String memo;   // 프로필 자유 메모 (1인당 1개)

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private MemberRole role;

    @Column(nullable = false)
    private boolean emailVerified;

    @Column(length = 100)
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

    /** 프로필 수정 (FR-AUTH-11의 데이터 부분). 인증·인가는 Phase 3에서 붙는다 */
    public void updateProfile(String nickname, String memo) {
        String normalized = TextValues.normalize(nickname);
        if (normalized == null) {
            throw new InvalidInputException("닉네임은 비울 수 없습니다");
        }
        this.nickname = normalized;
        this.memo = TextValues.normalize(memo);
    }
}