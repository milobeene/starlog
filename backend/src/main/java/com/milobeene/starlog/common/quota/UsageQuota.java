package com.milobeene.starlog.common.quota;

import com.milobeene.starlog.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;

/**
 * 회원 하루치 사용량 한 줄. **(회원, 날짜, 종류)가 곧 키다.**
 *
 * WEB-ONLY (docs/web-only-inventory.md).
 *
 * 대리키를 두지 않은 이유 — 대리키면 같은 삼중조가 두 줄 생기는 걸 막으려고 유니크 제약을
 * 또 걸어야 한다. 그럴 바엔 그 삼중조가 키다.
 *
 * 회원을 `@ManyToOne`으로 잡지 않고 id만 든다. 쿼터를 셀 때마다 회원을 끌어올 이유가 없고,
 * 복합키 안에 연관을 넣으면 매핑이 급격히 복잡해진다
 */
@Getter
@Entity
@Table(name = "usage_quota",
        indexes = @Index(name = "idx_usage_quota_date", columnList = "usage_date"))
public class UsageQuota extends BaseEntity {

    @EmbeddedId
    private UsageQuotaId id;

    @Column(nullable = false)
    private int used;

    protected UsageQuota() {
    }

    private UsageQuota(UsageQuotaId id, int used) {
        this.id = id;
        this.used = used;
    }

    public static UsageQuota firstUse(Long memberId, LocalDate date, QuotaKind kind) {
        return new UsageQuota(new UsageQuotaId(memberId, date, kind), 1);
    }

    /**
     * 복합키. `@Embeddable`은 equals/hashCode가 **필수**다 —
     * 영속성 컨텍스트가 이 값으로 1차 캐시를 찾는다. record면 컴파일러가 만들어 준다
     */
    @Embeddable
    public record UsageQuotaId(
            @Column(name = "member_id") Long memberId,
            @Column(name = "usage_date") LocalDate usageDate,
            @Enumerated(EnumType.STRING)
            @JdbcTypeCode(SqlTypes.VARCHAR)
            @Column(name = "kind", length = 30) QuotaKind kind) {
    }
}
