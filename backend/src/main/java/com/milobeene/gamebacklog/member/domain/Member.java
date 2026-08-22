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

    /**
     * 구글로 가입 (FR-AUTH-12).
     *
     * 비밀번호가 **null이다** — 소셜 전용 계정이 여기서 처음 생긴다.
     * 나중에 비밀번호를 만들고 싶으면 비밀번호 재설정 경로를 그대로 쓰면 된다
     * (PasswordResetService가 password null인 계정도 대상으로 잡는다).
     *
     * emailVerified를 구글 말만 믿고 넣는 이유 — 구글이 `email_verified: true`를 준 건
     * 그쪽에서 이미 소유를 확인했다는 뜻이라 우리가 같은 확인을 반복할 이유가 없다.
     * false면 우리 인증 메일을 따로 보낸다.
     */
    public static Member signUpWithGoogle(String email, String nickname,
                                          String googleSubject, boolean emailVerified) {
        Member member = new Member();
        member.email = email;
        member.password = null;
        member.nickname = nickname;
        member.role = MemberRole.USER;
        member.emailVerified = emailVerified;
        member.googleSubject = googleSubject;
        return member;
    }

    /**
     * 구글 계정 연결 (FR-AUTH-06). 저장하는 값은 이메일이 아니라 구글의 `sub`다 —
     * 이메일은 바뀔 수 있고 재사용될 수도 있지만 sub는 계정에 영구히 붙는다
     */
    public void linkGoogle(String googleSubject) {
        this.googleSubject = googleSubject;
    }

    /**
     * 연결 해제 (FR-AUTH-08).
     * BR-AUTH-01 — 비밀번호가 없으면 해제할 수 없다. 로그인 수단이 하나도 안 남는다
     */
    public void unlinkGoogle() {
        if (this.password == null || this.password.isBlank()) {
            throw new InvalidInputException("비밀번호를 먼저 설정해야 구글 연결을 해제할 수 있습니다");
        }
        this.googleSubject = null;
    }

    /** 관리자 승격 (I-9). 부트스트랩 경로에서만 부른다 */
    public void promoteToAdmin() {
        this.role = MemberRole.ADMIN;
    }

    /** 탈퇴 요청 (FR-AUTH-09). 소프트 삭제 — 유예가 끝나면 배치가 물리 삭제한다 */
    public void withdraw(LocalDateTime requestedAt) {
        this.deletedAt = requestedAt;
    }

    /** 유예 중 복구 (FR-AUTH-10) */
    public void restore() {
        this.deletedAt = null;
    }

    /** 비밀번호 변경 (FR-AUTH-05). 인코딩은 서비스가 끝내고 넘긴다 */
    public void changePassword(String encodedPassword) {
        this.password = encodedPassword;
    }

    /** 이메일 인증 완료 (FR-AUTH-02). 이미 인증된 계정에 다시 불러도 무해하다 */
    public void verifyEmail() {
        this.emailVerified = true;
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