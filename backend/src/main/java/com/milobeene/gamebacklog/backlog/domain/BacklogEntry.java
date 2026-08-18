package com.milobeene.gamebacklog.backlog.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.entity.Money;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.*;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Entity
@Table(
        uniqueConstraints = @UniqueConstraint(
                name = "uk_backlog_entry_member_game",
                columnNames = {"member_id", "game_id"}),
        indexes = {
                @Index(name = "idx_backlog_member_status", columnList = "member_id, status"),
                @Index(name = "idx_backlog_member_last_played", columnList = "member_id, last_played_on"),
                @Index(name = "idx_backlog_member_display_name", columnList = "member_id, display_name")
        })
public class BacklogEntry extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "game_id", nullable = false)
    private Game game;

    // ── 개인 오버라이드: null이면 마스터 값 사용
    @Column(length = 300)
    private String nameOverride;

    @Column(length = 200)
    private String developerOverride;

    @Column(length = 200)
    private String publisherOverride;

    private LocalDate releasedOnOverride;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "amount", column = @Column(name = "list_price_override_amount")),
            @AttributeOverride(name = "currency", column = @Column(name = "list_price_override_currency"))
    })
    private Money listPriceOverride;

    // ── 개인 기록
    @Column(precision = 4, scale = 1)
    private BigDecimal rating;        // 0.0 ~ 100.0

    private Integer playTimeHours;

    @Lob
    private String memo;

    // ── 비정규화 (갱신 책임은 서비스 계층)
    @Column(name = "display_name", nullable = false, length = 300)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BacklogStatus status;

    @Column(name = "last_played_on")
    private LocalDate lastPlayedOn;

    private LocalDateTime deletedAt;

    // 역방향(읽기 전용). mappedBy = 상대 엔티티의 필드명
    @OneToMany(mappedBy = "backlogEntry")
    private List<Playthrough> playthroughs = new ArrayList<>();

    /**
     * JPA 전용 기본 생성자
     */
    protected BacklogEntry() {}

    public static BacklogEntry of(Member member, Game game) {
        BacklogEntry entry = new BacklogEntry();
        entry.member = member;
        entry.game = game;
        entry.displayName = game.getName();
        entry.status = BacklogStatus.BACKLOG;
        return entry;
    }
}