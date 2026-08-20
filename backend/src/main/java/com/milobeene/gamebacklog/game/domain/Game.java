package com.milobeene.gamebacklog.game.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.entity.Money;
import com.milobeene.gamebacklog.common.util.TextValues;
import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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

    private LocalDateTime lastSyncedAt;

    /**
     * JPA 전용 기본 생성자
     */
    protected Game() {}

    /** 시각을 인자로 받는 이유 — 엔티티가 시계를 들면 테스트에서 고정할 수 없다 */
    public static Game fromRawg(String name, String externalId, LocalDateTime syncedAt) {
        Game game = new Game();
        game.name = name;
        game.source = GameSource.RAWG;
        game.externalId = externalId;
        game.lastSyncedAt = syncedAt;
        return game;
    }

    public static Game manual(String name) {
        Game game = new Game();
        game.name = name;
        game.source = GameSource.MANUAL;
        return game;
    }

    /**
     * 마스터 이름 수정 (FR-ADM-01). 전파는 GameService가 책임진다.
     * 빈 값을 막는 이유 — name은 nullable = false이고,
     * null이면 BacklogEntry.displayName 계산이 깨진다 (설계서 §356)
     */
    public void updateName(String name) {
        String normalized = TextValues.normalize(name);
        if (normalized == null) {
            throw new IllegalArgumentException("게임 이름은 비울 수 없습니다");
        }
        this.name = normalized;
    }

    /**
     * 마스터 정보 설정. A-7(관리자 수정)·Phase 4(RAWG 동기화)에서 재사용한다.
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
}
