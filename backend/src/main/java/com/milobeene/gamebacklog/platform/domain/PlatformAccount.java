package com.milobeene.gamebacklog.platform.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.*;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_platform_account",
        columnNames = {"member_id", "platform_id", "account_label"}))
public class PlatformAccount extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // FK를 가진 쪽 = 연관관계의 주인. LAZY를 반드시 명시 (ToOne 기본값은 EAGER)
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "platform_id", nullable = false)
    private Platform platform;

    @Column(name = "account_label", nullable = false, length = 50)
    private String accountLabel;

    private LocalDateTime deletedAt;

    /**
     * JPA 전용 기본 생성자
     */
    protected PlatformAccount() {}

    public PlatformAccount(Member member, Platform platform, String accountLabel) {
        this.member = member;
        this.platform = platform;
        this.accountLabel = requireLabel(accountLabel);
    }

    /** 라벨은 표시용 별칭이다. 실제 플랫폼 계정과 연동하지 않는다 (§6.5) */
    public void rename(String accountLabel) {
        this.accountLabel = requireLabel(accountLabel);
    }

    /**
     * 소프트 삭제 (§6.5, §7.4). 회차·취득이 이 계정을 참조하므로 행을 보존한다.
     * 삭제해도 과거 기록에서는 계정 이름이 계속 보여야 한다
     */
    public void softDelete(LocalDateTime deletedAt) {
        if (isDeleted()) {
            throw new IllegalStateException("이미 삭제된 계정입니다. id=" + id);
        }
        this.deletedAt = deletedAt;
    }

    public void revive() {
        if (!isDeleted()) {
            throw new IllegalStateException("삭제되지 않은 계정입니다. id=" + id);
        }
        this.deletedAt = null;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    private static String requireLabel(String accountLabel) {
        String normalized = TextValues.normalize(accountLabel);
        if (normalized == null) {
            throw new IllegalArgumentException("계정 라벨은 비울 수 없습니다");
        }
        return normalized;
    }
}