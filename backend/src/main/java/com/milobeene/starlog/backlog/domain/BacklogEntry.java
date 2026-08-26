package com.milobeene.starlog.backlog.domain;

import com.milobeene.starlog.common.entity.BaseEntity;
import com.milobeene.starlog.common.entity.Money;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.tag.domain.Tag;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
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
                @Index(name = "idx_backlog_member_display_name", columnList = "member_id, display_name"),
                @Index(name = "idx_backlog_member_released_on", columnList = "member_id, released_on_resolved"),
                @Index(name = "idx_backlog_member_tag", columnList = "member_id, tag_id")
        })
public class BacklogEntry extends BaseEntity {

    private static final BigDecimal RATING_MIN = new BigDecimal("0.0");
    private static final BigDecimal RATING_MAX = new BigDecimal("100.0");

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

    @ElementCollection
    @CollectionTable(name = "backlog_developer_override",
            joinColumns = @JoinColumn(name = "backlog_entry_id"))
    @Column(name = "developer", length = 200)
    private List<String> developerOverrides = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "backlog_publisher_override",
            joinColumns = @JoinColumn(name = "backlog_entry_id"))
    @Column(name = "publisher", length = 200)
    private List<String> publisherOverrides = new ArrayList<>();

    private LocalDate releasedOnOverride;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "amount",
                    column = @Column(name = "list_price_override_amount", precision = 19, scale = 2)),
            @AttributeOverride(name = "currency",
                    column = @Column(name = "list_price_override_currency", length = 3))
    })
    private Money listPriceOverride;

    // ── 개인 기록
    @Column(precision = 4, scale = 1)
    private BigDecimal rating;        // 0.0 ~ 100.0

    private Integer playTimeHours;

    @Column(columnDefinition = "TEXT")
    private String memo;

    // ── 비정규화 (갱신 책임은 서비스 계층)
    @Column(name = "display_name", nullable = false, length = 300)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private BacklogStatus status;

    @Column(name = "last_played_on")
    private LocalDate lastPlayedOn;

    /**
     * 출시일 표시값 비정규화 (§7.2). displayName과 같은 이유다 —
     * 정렬 대상이 오버라이드와 마스터로 흩어져 있으면 COALESCE 조인이 되어 인덱스를 못 탄다.
     * 갱신 경로는 refreshReleasedOn() 하나뿐
     */
    @Column(name = "released_on_resolved")
    private LocalDate releasedOnResolved;

    /**
     * 마지막 회차 참조 (§7.2 비정규화). 목록 화면이 "N회차 · 기간 · 기기"를 보여줘야 하는데
     * 매번 회차를 뒤지면 항목 수만큼 쿼리가 나간다.
     * ToOne이라 join fetch가 되고 페이징도 살아남는다.
     * 갱신 경로가 syncDerivedState() 하나뿐이라 유지 비용은 lastPlayedOn과 같다
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "last_playthrough_id")
    private Playthrough lastPlaythrough;

    /**
     * 개인 태그 (FR-TAG-01). **항목당 최대 하나다** — 태그는 설명용 메타데이터가 아니라
     * 라이브러리를 묶는 장치라서(design-request.md), 다중 소속은 사이드바에 같은 게임을
     * 여러 번 띄울 뿐이다. 서술용 다중값은 개인 장르가 맡는다
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tag_id")
    private Tag tag;

    private LocalDateTime deletedAt;

    // 역방향(읽기 전용). mappedBy = 상대 엔티티의 필드명
    @OneToMany(mappedBy = "backlogEntry")
    private List<Playthrough> playthroughs = new ArrayList<>();

    // 역방향 컬렉션은 필요해지는 시점에 추가한다 (§13). 상태 파생이 취득을 봐야 해서 여기서 추가
    @OneToMany(mappedBy = "backlogEntry")
    private List<Acquisition> acquisitions = new ArrayList<>();

    // 장르만 컬렉션을 둔다. 마스터 폴백 계산이 엔티티 안에서 일어나야 하기 때문 (§5.2).
    // 태그는 단일 ToOne이라 컬렉션 자체가 없다
    @OneToMany(mappedBy = "backlogEntry")
    private List<BacklogEntryGenre> genreLinks = new ArrayList<>();

    /**
     * JPA 전용 기본 생성자
     */
    protected BacklogEntry() {}

    public static BacklogEntry of(Member member, Game game) {
        BacklogEntry entry = new BacklogEntry();
        entry.member = member;
        entry.game = game;
        entry.status = BacklogStatus.WISHLIST; //담을 때 취득 정보가 없으면 → WISHLIST | 취득이 붙으면 → 그때 상태 재계산
        entry.refreshDisplayName();
        entry.refreshReleasedOn();
        return entry;
    }

    /**
     * 개인 기록 전체 교체. null을 넘기면 해당 값은 지워진다.
     */
    public void updatePersonalRecord(BigDecimal rating, Integer playTimeHours, String memo) {
        this.rating = normalizeRating(rating);
        this.playTimeHours = validatePlayTimeHours(playTimeHours);
        this.memo = TextValues.normalize(memo);
    }

    /**
     * 오버라이드 전체 교체 (FR-BL-03, 04).
     * null·빈 리스트를 넘기면 오버라이드가 지워지고 마스터 값이 다시 표시된다.
     */
    public void updateOverrides(OverrideCommand command) {
        this.nameOverride = TextValues.normalize(command.name());
        TextValues.replaceAll(this.developerOverrides, command.developers());
        TextValues.replaceAll(this.publisherOverrides, command.publishers());
        this.releasedOnOverride = command.releasedOn();
        this.listPriceOverride = command.listPrice();

        refreshDisplayName();
        refreshReleasedOn();
    }

    /**
     * 소프트 삭제 (FR-BL-08). 회차·취득은 물리 삭제 대상이지만
     * 부모가 숨겨지면 같이 숨겨지므로 여기서 건드릴 게 없다 (§7.4)
     */
    public void softDelete(LocalDateTime deletedAt) {
        if (isDeleted()) {
            throw new ConflictException("이미 삭제된 항목입니다. id=" + id);
        }
        this.deletedAt = deletedAt;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    /**
     * 되살리기 (§7.4). 백지로 밀지 않고 기존 평점·회차·취득을 그대로 되돌린다.
     * deletedAt만 지우면 되는 이유 — 자식 기록은 애초에 지운 적이 없다
     */
    public void revive() {
        if (!isDeleted()) {
            throw new ConflictException("삭제되지 않은 항목입니다. id=" + id);
        }
        this.deletedAt = null;
        // 지금은 삭제 중 자식 수정이 막혀 있어 드리프트 경로가 없지만,
        // 나중에 경로가 생겨도 조용히 어긋나지 않게 방어적으로 재계산한다
        syncDerivedState();
    }

    /**
     * 연관관계 편의 메서드. mappedBy 역방향 컬렉션은 읽기 전용이라
     * Playthrough를 persist만 해서는 이미 로드된 이 컬렉션에 들어오지 않는다.
     * 그러면 바로 뒤에 부르는 syncDerivedState()가 방금 넣은 회차를 못 본다
     */
    public void addPlaythrough(Playthrough playthrough) {
        this.playthroughs.add(playthrough);
    }

    public void removePlaythrough(Playthrough playthrough) {
        this.playthroughs.remove(playthrough);
    }

    public void addAcquisition(Acquisition acquisition) {
        this.acquisitions.add(acquisition);
    }

    public void removeAcquisition(Acquisition acquisition) {
        this.acquisitions.remove(acquisition);
    }

    public void addGenreLink(BacklogEntryGenre link) {
        this.genreLinks.add(link);
    }

    public void removeGenreLink(BacklogEntryGenre link) {
        this.genreLinks.remove(link);
    }

    /** 태그 교체 (FR-TAG-01). null이면 태그를 뗀다 — 사전 행은 남고 조회에서 걸러진다 (§6.7) */
    public void changeTag(Tag tag) {
        this.tag = tag;
    }

    /**
     * status·lastPlayedOn 재계산 (§7.6). 회차가 있으면 회차가, 없으면 취득이 정한다.
     * 최신 회차 = COALESCE(종료일, 시작일) 최대 — 번호가 아니다.
     * 과거 플레이를 뒤늦게 입력해도 상태가 과거 회차로 끌려가지 않게 하기 위함
     */
    public void syncDerivedState() {
        Playthrough latest = playthroughs.stream()
                .max(Comparator.comparing(Playthrough::lastActivityOn)
                        .thenComparing(Playthrough::getSequenceNo))
                .orElse(null);

        if (latest != null) {
            this.status = latest.getStatus().toBacklogStatus();
            this.lastPlayedOn = latest.lastActivityOn();
            this.lastPlaythrough = latest;
            return;
        }

        /*
         * 회차 없음 → 취득이 정한다.
         *
         * **취득 기록이 하나라도 있으면 BACKLOG다** (2026-08-26 개정). 예전엔 NOT_OWNED를
         * 빼고 셌는데, 그러면 에뮬로 굴릴 롬을 챙겨둔 것처럼 **손에 닿는 게 분명한 것까지
         * 위시리스트**로 갔다. 위시리스트는 "아직 아무 기록도 없이 갖고 싶은 것"이어야 한다.
         *
         * NOT_OWNED는 이제 상태가 아니라 **소유 여부**만 나타낸다 — 지출 집계에서 빠지고
         * 취득 목록에 방식으로 남는다
         */
        this.lastPlayedOn = null;
        this.lastPlaythrough = null;
        this.status = acquisitions.isEmpty() ? BacklogStatus.WISHLIST : BacklogStatus.BACKLOG;
    }

    /**
     * displayName 갱신 경로는 여기 하나뿐 (§7.2).
     * A-7의 마스터 이름 수정도 이 메서드를 부른다.
     */
    public void refreshDisplayName() {
        this.displayName = (nameOverride != null) ? nameOverride : game.getName();
    }

    /**
     * 출시일 표시값 갱신. 마스터 출시일이 바뀌는 경로(Phase 4 재동기화)에서도
     * 이걸 불러야 한다 — 안 부르면 정렬만 옛 값으로 조용히 어긋난다
     */
    public void refreshReleasedOn() {
        this.releasedOnResolved = resolvedReleasedOn();
    }

    // ── 표시값: 오버라이드 ?? 마스터 (§5.2). 리스트는 isEmpty() 기준
    //
    // 컬렉션은 전부 List.copyOf로 복사해서 내보낸다 — Hibernate 컬렉션 "인스턴스"가
    // 트랜잭션 밖(Jackson 직렬화)으로 새어나가면 LazyInitializationException이 난다.
    // 호출부 규율(DTO마다 copyOf)에 맡기지 않고 여기서 막아야 잊는 것 자체가 불가능하다.
    // 이미 불변 리스트면 List.copyOf가 복사 없이 그대로 돌려주므로 중복 비용도 없다

    public List<String> resolvedDevelopers() {
        return List.copyOf(developerOverrides.isEmpty() ? game.getDevelopers() : developerOverrides);
    }

    public List<String> resolvedPublishers() {
        return List.copyOf(publisherOverrides.isEmpty() ? game.getPublishers() : publisherOverrides);
    }

    public LocalDate resolvedReleasedOn() {
        return releasedOnOverride != null ? releasedOnOverride : game.getReleasedOn();
    }

    public Money resolvedListPrice() {
        return listPriceOverride != null ? listPriceOverride : game.getListPrice();
    }

    /** 개인 장르가 1개 이상이면 개인, 없으면 마스터(RAWG) 장르 (§6.7 폴백 규칙) */
    public List<String> resolvedGenres() {
        List<String> personal = genreLinks.stream()
                .map(link -> link.getGenre().getName())
                .toList();
        return personal.isEmpty() ? game.getMasterGenres() : personal;   // toList()도 이미 새 리스트
    }

    // ── 문자열 컬렉션 getter — Lombok @Getter는 손으로 쓴 getter가 있는 필드를 건너뛴다.
    // 내부 변경은 필드 직접 접근(TextValues.replaceAll)이라 영향 없다

    public List<String> getDeveloperOverrides() {
        return List.copyOf(developerOverrides);
    }

    public List<String> getPublisherOverrides() {
        return List.copyOf(publisherOverrides);
    }

    private static BigDecimal normalizeRating(BigDecimal value) {
        if (value == null) {
            return null;
        }
        BigDecimal scaled = value.setScale(1, RoundingMode.HALF_UP);
        if (scaled.compareTo(RATING_MIN) < 0 || scaled.compareTo(RATING_MAX) > 0) {
            throw new InvalidInputException("평점은 0.0 ~ 100.0 범위여야 합니다: " + value);
        }
        return scaled;
    }

    private static Integer validatePlayTimeHours(Integer hours) {
        if (hours == null) {
            return null;
        }
        if (hours < 0) {
            throw new InvalidInputException("플레이 시간은 0 이상이어야 합니다: " + hours);
        }
        return hours;
    }
}