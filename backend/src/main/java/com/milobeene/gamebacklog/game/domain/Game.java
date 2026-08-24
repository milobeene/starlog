package com.milobeene.gamebacklog.game.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.entity.Money;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.util.TextValues;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_game_source_external_id",
        columnNames = {"source", "external_id"}))
public class Game extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 300)
    private String name;

    // @ElementCollection: 값 타입 컬렉션. 별도 테이블이 생기고 Game이 통째로 소유한다
    @ElementCollection
    @CollectionTable(name = "game_developer",
            joinColumns = @JoinColumn(name = "game_id"))
    @Column(name = "developer", length = 200)
    private List<String> developers = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "game_publisher",
            joinColumns = @JoinColumn(name = "game_id"))
    @Column(name = "publisher", length = 200)
    private List<String> publishers = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "game_master_genre",
            joinColumns = @JoinColumn(name = "game_id"))
    @Column(name = "genre", length = 100)
    private List<String> masterGenres = new ArrayList<>();

    private LocalDate releasedOn;

    @Embedded
    @AttributeOverrides({
            @AttributeOverride(name = "amount",
                    column = @Column(name = "list_price_amount", precision = 19, scale = 2)),
            @AttributeOverride(name = "currency",
                    column = @Column(name = "list_price_currency", length = 3))
    })
    private Money listPrice;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(nullable = false, length = 20)
    private GameSource source;

    @Column(name = "external_id", length = 50)
    private String externalId;

    /**
     * IGDB cover.image_id (세로 박스아트). **URL이 아니라 id다** — 크기별 URL은 표시 시점에 조합한다 (§6.10).
     * URL을 통째로 저장하면 크기를 바꿀 때마다 전 행을 갱신해야 한다.
     * 개인 업로드 커버가 우선이고 이건 폴백이다
     */
    @Column(length = 50)
    private String coverImageId;

    /** IGDB artworks[].image_id (가로 키아트). 상세 화면 상단용. 개인 배너는 두지 않는다 */
    @Column(length = 50)
    private String bannerImageId;

    /**
     * About / Storyline. 영문 원문 그대로 둔다 — 번역·수정하지 않는다 (§6.2).
     *
     * **TEXT인 이유는 실측이다.** IGDB 2,000건을 훑어보니
     * summary는 최대 3,254자, **storyline은 20,764자**였다. 2000자로 잡았다가
     * 인기 게임을 담는 순간 저장이 터진다.
     *
     * 목록 조회가 join fetch b.game이라 이 둘이 카드마다 딸려온다.
     * 개인 규모라 감수하고 한 테이블로 뒀다 — 무거워지면 GameDetail 1:1 분리가 탈출구다
     */
    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(columnDefinition = "TEXT")
    private String storyline;

    /** IGDB 유저 평점 0~100. 평론가 평점(aggregated_rating)은 쓰지 않기로 했다 (§6.2) */
    @Column(precision = 5, scale = 2)
    private BigDecimal igdbRating;

    /** 표본 수. 수천 단위라 신뢰도 판단에 쓴다 */
    private Integer igdbRatingCount;

    /**
     * 출시 하드웨어 기종 (PS5, Switch, PC).
     *
     * ⚠️ **`Platform` 엔티티와 다른 개념이다.** 그쪽은 Steam·PSN 같은 유통·계정 체계다 (§2 용어).
     * `Device`(내 보유 기기)와도 겹쳐 보이지만 엮지 않는다
     */
    @ElementCollection
    @CollectionTable(name = "game_release_platform",
            joinColumns = @JoinColumn(name = "game_id"))
    @Column(name = "platform_name", length = 100)
    private List<String> releasePlatforms = new ArrayList<>();

    /**
     * 클리어 소요 시간 3종 (IGDB game_time_to_beats, 초 → 시간). 참고값이라 오버라이드 대상이 아니다.
     *
     * v1.6에서 `timeToBeatHours` 하나였는데 상세 화면이 세 축을 요구해 쪼갰다 —
     * `normally`가 곧 mainExtraHours라 옛 값은 그 자리로 이어진다.
     * **All Styles는 IGDB에 없어 만들지 않는다** (§6.2)
     */
    private Integer mainStoryHours;

    private Integer mainExtraHours;

    private Integer completionistHours;

    /** 표본 수. 퍼센트(Confidence)로 환산하지 않는다 — 환산 공식이 없다 */
    private Integer timeToBeatSamples;

    private LocalDateTime lastSyncedAt;

    /**
     * JPA 전용 기본 생성자
     */
    protected Game() {}

    /** 시각을 인자로 받는 이유 — 엔티티가 시계를 들면 테스트에서 고정할 수 없다 */
    public static Game fromCatalog(String name, String externalId, LocalDateTime syncedAt) {
        Game game = new Game();
        game.name = name;
        game.source = GameSource.IGDB;
        game.externalId = externalId;
        game.lastSyncedAt = syncedAt;
        return game;
    }

    /** 수동 등록 (FR-GAME-04). 이름 정규화·빈 값 검증은 updateName이 이미 들고 있다 */
    public static Game manual(String name) {
        Game game = new Game();
        game.source = GameSource.MANUAL;
        game.updateName(name);
        return game;
    }

    // ── 문자열 컬렉션 getter — BacklogEntry와 같은 이유로 복사본을 반환한다.
    // LAZY @ElementCollection이 트랜잭션 밖으로 새는 것을 원천 차단

    public List<String> getDevelopers() {
        return List.copyOf(developers);
    }

    public List<String> getPublishers() {
        return List.copyOf(publishers);
    }

    public List<String> getMasterGenres() {
        return List.copyOf(masterGenres);
    }

    /**
     * 마스터 이름 수정 (FR-ADM-01). 전파는 GameService가 책임진다.
     * 빈 값을 막는 이유 — name은 nullable = false이고,
     * null이면 BacklogEntry.displayName 계산이 깨진다 (설계서 §356)
     */
    public void updateName(String name) {
        String normalized = TextValues.normalize(name);
        if (normalized == null) {
            throw new InvalidInputException("게임 이름은 비울 수 없습니다");
        }
        this.name = normalized;
    }

    /**
     * 마스터 정보 설정. **항목이 이미 담긴 게임은 GameService.syncMasterInfo로 들어올 것** —
     * 여기만 부르면 releasedOnResolved 전파가 빠진다. 직접 호출은 항목 생성 전(시드·신규 등록)만.
     * 컬렉션은 새 List로 갈아끼우지 않고 clear() + addAll() 한다.
     * @ElementCollection은 Hibernate가 컬렉션 "인스턴스"를 추적하므로,
     * 참조를 바꿔버리면 기존 걸 통째로 DELETE 후 재INSERT 한다.
     */
    public void updateMasterInfo(List<String> developers, List<String> publishers,
                                 List<String> masterGenres, LocalDate releasedOn, Money listPrice) {
        TextValues.replaceAll(this.developers, developers);
        TextValues.replaceAll(this.publishers, publishers);
        TextValues.replaceAll(this.masterGenres, masterGenres);
        this.releasedOn = releasedOn;
        this.listPrice = listPrice;
    }

    /**
     * 외부 DB 응답으로 마스터를 채운다 (J-3 최초 캐시, J-5 재동기화 공용).
     *
     * **listPrice를 건드리지 않는 게 핵심이다.** 외부 DB는 가격을 주지 않으므로(§6.2)
     * updateMasterInfo처럼 전체 교체를 하면 누군가 손으로 넣은 정가가 재동기화 때마다 날아간다.
     * name도 여기서 안 바꾼다 — 이름 변경은 담긴 항목의 displayName 전파가 딸려 있어
     * updateName 경로로만 들어가야 한다 (§7.2)
     */
    public void syncFromCatalog(CatalogSyncCommand command, LocalDateTime syncedAt) {
        TextValues.replaceAll(this.developers, command.developers());
        TextValues.replaceAll(this.publishers, command.publishers());
        TextValues.replaceAll(this.masterGenres, command.masterGenres());
        TextValues.replaceAll(this.releasePlatforms, command.releasePlatforms());

        this.releasedOn = command.releasedOn();
        this.coverImageId = command.coverImageId();
        this.bannerImageId = command.bannerImageId();
        this.summary = command.summary();
        this.storyline = command.storyline();
        this.igdbRating = command.igdbRating();
        this.igdbRatingCount = command.igdbRatingCount();
        this.mainStoryHours = command.mainStoryHours();
        this.mainExtraHours = command.mainExtraHours();
        this.completionistHours = command.completionistHours();
        this.timeToBeatSamples = command.timeToBeatSamples();

        this.lastSyncedAt = syncedAt;
    }

    public List<String> getReleasePlatforms() {
        return List.copyOf(releasePlatforms);
    }
}
