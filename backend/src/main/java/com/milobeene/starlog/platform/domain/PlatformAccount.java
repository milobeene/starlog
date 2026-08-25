package com.milobeene.starlog.platform.domain;

import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.domain.MemberOwnedEntity;
import jakarta.persistence.*;
import lombok.Getter;

/**
 * 플랫폼 계정 (FR-PLT-01, 02).
 *
 * 플랫폼이 있어야 존재할 수 있는 유일한 선택지다 — 나머지 넷은 이름만 있으면 선다.
 * 플랫폼 이름이 바뀌면 여기도 따라 바뀐다 (FK라 이름을 복사해두지 않았다)
 */
@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_platform_account",
        columnNames = {"member_id", "platform_id", "account_label"}))
public class PlatformAccount extends MemberOwnedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // FK를 가진 쪽 = 연관관계의 주인. LAZY를 반드시 명시 (ToOne 기본값은 EAGER)
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "platform_id", nullable = false)
    private Platform platform;

    @Column(name = "account_label", nullable = false, length = 50)
    private String accountLabel;

    /**
     * JPA 전용 기본 생성자
     */
    protected PlatformAccount() {}

    public PlatformAccount(Member member, Platform platform, String accountLabel) {
        super(member);
        this.platform = platform;
        this.accountLabel = requireLabel(accountLabel);
    }

    /** 라벨은 표시용 별칭이다. 실제 플랫폼 계정과 연동하지 않는다 (§6.5) */
    public void rename(String accountLabel) {
        this.accountLabel = requireLabel(accountLabel);
    }

    @Override
    public String displayName() {
        return accountLabel;
    }

    private static String requireLabel(String accountLabel) {
        return TextValues.require(accountLabel, "계정 라벨은 비울 수 없습니다");
    }
}
