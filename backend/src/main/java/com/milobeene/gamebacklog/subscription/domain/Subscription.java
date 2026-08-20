package com.milobeene.gamebacklog.subscription.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.entity.Money;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;

@Getter
@Entity
public class Subscription extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    // OI-06 결정: 문자열 (참조 대상도 통계 축도 아님)
    @Column(nullable = false, length = 100)
    private String serviceName;

    @Column(nullable = false)
    private LocalDate startedOn;

    private LocalDate endedOn;   // null = 구독 중

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "amount",
                    column = @Column(name = "fee_amount", precision = 19, scale = 2)),
            @AttributeOverride(name = "currency",
                    column = @Column(name = "fee_currency", length = 3))
    })
    private Money fee;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private BillingCycle billingCycle;

    /**
     * JPA 전용 기본 생성자
     */
    protected Subscription() {}

    public static Subscription of(Member member, SubscriptionCommand command) {
        Subscription subscription = new Subscription();
        subscription.member = member;
        subscription.apply(command);
        return subscription;
    }

    /** 전체 교체 (F-1) */
    public void update(SubscriptionCommand command) {
        apply(command);
    }

    public boolean isActive() {
        return endedOn == null;
    }

    private void apply(SubscriptionCommand command) {
        String serviceName = TextValues.normalize(command.serviceName());
        if (serviceName == null) {
            throw new InvalidInputException("구독 서비스명은 필수입니다");
        }
        if (command.startedOn() == null) {
            throw new InvalidInputException("구독 시작일은 필수입니다");
        }
        if (command.billingCycle() == null) {
            throw new InvalidInputException("결제 주기는 필수입니다");
        }
        // 회차의 BR-PT-01과 같은 규칙. 당일 종료도 유효하므로 isBefore로 판정
        if (command.endedOn() != null && command.endedOn().isBefore(command.startedOn())) {
            throw new InvalidInputException(
                    "종료일은 시작일 이후여야 합니다: " + command.startedOn() + " ~ " + command.endedOn());
        }

        this.serviceName = serviceName;
        this.startedOn = command.startedOn();
        this.endedOn = command.endedOn();
        this.billingCycle = command.billingCycle();
        // 금액은 선택. 넣으면 Money가 스스로 음수·ISO 4217을 검증한다
        this.fee = (command.feeAmount() == null) ? null
                : new Money(command.feeAmount(), command.feeCurrency());
    }
}