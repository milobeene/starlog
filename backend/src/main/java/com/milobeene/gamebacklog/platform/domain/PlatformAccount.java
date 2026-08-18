package com.milobeene.gamebacklog.platform.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
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
        this.accountLabel = accountLabel;
    }
}