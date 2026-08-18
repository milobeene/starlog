package com.milobeene.gamebacklog.game.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.entity.Money;
import jakarta.persistence.*;
import lombok.Getter;

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
            @AttributeOverride(name = "amount", column = @Column(name = "list_price_amount")),
            @AttributeOverride(name = "currency", column = @Column(name = "list_price_currency"))
    })
    private Money listPrice;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private GameSource source;

    @Column(name = "external_id", length = 50)
    private String externalId;

    private LocalDateTime lastSyncedAt;

    /**
     * JPA 전용 기본 생성자
     */
    protected Game() {}

    public static Game fromRawg(String name, String externalId) {
        Game game = new Game();
        game.name = name;
        game.source = GameSource.RAWG;
        game.externalId = externalId;
        game.lastSyncedAt = LocalDateTime.now();
        return game;
    }

    public static Game manual(String name) {
        Game game = new Game();
        game.name = name;
        game.source = GameSource.MANUAL;
        return game;
    }
}
