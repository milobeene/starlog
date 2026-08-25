package com.milobeene.starlog.backlog.domain;

import com.milobeene.starlog.common.entity.BaseEntity;
import com.milobeene.starlog.tag.domain.Genre;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_backlog_entry_genre",
        columnNames = {"backlog_entry_id", "genre_id"}))
public class BacklogEntryGenre extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "backlog_entry_id", nullable = false)
    private BacklogEntry backlogEntry;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "genre_id", nullable = false)
    private Genre genre;

    /**
     * JPA 전용 기본 생성자
     */
    protected BacklogEntryGenre() {}

    public BacklogEntryGenre(BacklogEntry backlogEntry, Genre genre) {
        this.backlogEntry = backlogEntry;
        this.genre = genre;
    }
}