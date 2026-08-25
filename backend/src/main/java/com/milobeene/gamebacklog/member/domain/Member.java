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
     * 관리자 가입 승인 시각. **null이면 승인 대기**다 (FR-ADM-06).
     *
     * 왜 boolean이 아닌가 — 언제 승인했는지가 감사에 필요하고, `deletedAt`과 같은 규약이라
     * "시각이 있으면 그 사건이 일어났다"로 코드 전체가 일관된다.
     *
     * 왜 REJECTED 상태가 없는가 — 상태를 늘리면 로그인·목록·통계 모든 분기에서 다뤄야 한다.
     * 거절은 관리자가 그 대기 계정을 지우는 것으로 갈음한다.
     *
     * **기본값이 대기다.** 가입 경로가 아니라 시드·부트스트랩처럼 내부에서 만드는 계정이
     * approve()를 빠뜨리면 로그인이 막힌다 — 반대로 새는 것보다 이쪽이 안전하다
     */
    private LocalDateTime approvedAt;

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
     * 연결 해제 (FR-AUTH-08) — **현재 항상 거부된다.**
     *
     * BR-AUTH-01은 "비밀번호가 없으면 해제 불가"였다. 그런데 이메일 가입과 비밀번호 설정을
     * 둘 다 막아둔 지금(인증 메일을 보낼 수 없다), 해제를 허용하면 **로그인 수단이 하나도
     * 안 남는 계정**이 생긴다. 비밀번호를 가진 계정이라 해도 다시 연결할 방법이 없어
     * 되돌리기 어려운 조작이라 통째로 닫았다.
     *
     * 계정을 정리하려면 탈퇴한다 — 30일 유예가 있어 되돌릴 수 있다 (FR-AUTH-09/10).
     * 메일 발송이 가능해지면 위 두 제한과 함께 풀린다
     */
    public void unlinkGoogle() {
        throw new InvalidInputException(
                "Google 연결은 해제하실 수 없습니다. 계정을 정리하시려면 회원 탈퇴를 이용해 주세요");
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

    /**
     * 비밀번호가 있는 계정인가. 구글로 가입하면 null이다 (BR-AUTH-01).
     * 필드를 밖으로 내주는 대신 판단을 여기서 끝낸다 — 해시가 서비스로 새어나갈 이유가 없다
     */
    public boolean hasPassword() {
        return this.password != null && !this.password.isBlank();
    }

    /** 이메일 인증 완료 (FR-AUTH-02). 이미 인증된 계정에 다시 불러도 무해하다 */
    public void verifyEmail() {
        this.emailVerified = true;
    }

    /**
     * 가입 승인 (FR-ADM-06). 멱등이다 — 이미 승인된 계정의 승인 시각을 덮어쓰지 않는다.
     * 덮어쓰면 "언제 들어온 사람인가"라는 감사 기록이 사라진다
     */
    public void approve(LocalDateTime approvedAt) {
        if (this.approvedAt == null) {
            this.approvedAt = approvedAt;
        }
    }

    public boolean isApproved() {
        return approvedAt != null;
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