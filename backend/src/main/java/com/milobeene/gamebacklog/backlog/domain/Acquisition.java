package com.milobeene.gamebacklog.backlog.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.entity.Money;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.platform.domain.Platform;
import com.milobeene.gamebacklog.platform.domain.PlatformAccount;
import com.milobeene.gamebacklog.subscription.domain.Subscription;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;

@Getter
@Entity
public class Acquisition extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "backlog_entry_id", nullable = false)
    private BacklogEntry backlogEntry;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private AcquisitionMethod method;

    // 실물 구매: platform만 있고 platformAccount는 null
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "platform_id")
    private Platform platform;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "platform_account_id")
    private PlatformAccount platformAccount;

    // method == SUBSCRIPTION일 때 연결 (FR-ACQ-05)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id")
    private Subscription subscription;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "amount",
                    column = @Column(name = "price_amount", precision = 19, scale = 2)),
            @AttributeOverride(name = "currency",
                    column = @Column(name = "price_currency", length = 3))
    })
    private Money price;

    private LocalDate acquiredOn;

    @Column(length = 100)
    private String label;   // "스위치판 재구매", "DLC - 쿠파 왕국"

    /**
     * JPA 전용 기본 생성자
     */
    protected Acquisition() {}

    public static Acquisition of(BacklogEntry entry, AcquisitionCommand command) {
        Acquisition acquisition = new Acquisition();
        acquisition.backlogEntry = entry;
        acquisition.apply(command);
        return acquisition;
    }

    /** 전체 교체 (C-4) */
    public void update(AcquisitionCommand command) {
        apply(command);
    }

    /**
     * 참조 연결. 엔티티는 리포지토리를 모르므로 서비스가 조회해서 넘긴다.
     * 실물 구매처럼 계정이 없으면 platformAccount는 null이고 platform만 남는다 (§6.6)
     */
    public void assignReferences(Platform platform, PlatformAccount platformAccount) {
        this.platform = platform;
        this.platformAccount = platformAccount;
    }

    /** 구독 연결 (FR-ACQ-05). 방식이 SUBSCRIPTION일 때만 서비스가 넘긴다 */
    public void assignSubscription(Subscription subscription) {
        this.subscription = subscription;
    }

    /** §7.6 — NOT_OWNED만 아니면 "가지고 있다"로 본다 */
    public boolean impliesOwnership() {
        return method != AcquisitionMethod.NOT_OWNED;
    }

    private void apply(AcquisitionCommand command) {
        if (command.method() == null) {
            throw new InvalidInputException("취득 방식은 필수입니다");
        }
        // 모순 차단. SUBSCRIPTION인데 연결이 없는 건 허용한다 — 제약 최소화 방침
        if (command.subscriptionId() != null && command.method() != AcquisitionMethod.SUBSCRIPTION) {
            throw new InvalidInputException("취득 방식이 SUBSCRIPTION일 때만 구독을 연결할 수 있습니다");
        }

        this.method = command.method();
        // 금액은 모든 방식에서 선택. 넣으면 Money가 스스로 음수·ISO 4217을 검증한다
        this.price = (command.priceAmount() == null) ? null
                : new Money(command.priceAmount(), command.priceCurrency());
        this.acquiredOn = command.acquiredOn();
        this.label = TextValues.normalize(command.label());
    }
}