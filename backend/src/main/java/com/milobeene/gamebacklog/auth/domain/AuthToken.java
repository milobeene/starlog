package com.milobeene.gamebacklog.auth.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;

@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_auth_token_hash", columnNames = "token_hash"),
        indexes = @Index(name = "idx_auth_token_expires_at", columnList = "expires_at"))
public class AuthToken extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 30)   // EMAIL_VERIFICATION이 18자라 여유 있게
    private TokenPurpose purpose;

    // 토큰 원문 저장 금지 — 해시만 (NFR-S2)
    @Column(nullable = false, length = 100)
    private String tokenHash;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    private LocalDateTime usedAt;   // null = 미사용

    /**
     * JPA 전용 기본 생성자
     */
    protected AuthToken() {}

    public AuthToken(Member member, TokenPurpose purpose, String tokenHash, LocalDateTime expiresAt) {
        this.member = member;
        this.purpose = purpose;
        this.tokenHash = tokenHash;
        this.expiresAt = expiresAt;
    }

    public boolean isUsable(TokenPurpose expected, LocalDateTime now) {
        return this.purpose == expected && this.usedAt == null && now.isBefore(this.expiresAt);
    }

    /** 1회용. 두 번째 호출은 아무 일도 하지 않는다 — 재사용 판정은 isUsable이 한다 */
    public void markUsed(LocalDateTime now) {
        if (this.usedAt == null) {
            this.usedAt = now;
        }
    }
}