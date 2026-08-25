package com.milobeene.starlog.backlog.domain;

import com.milobeene.starlog.common.entity.BaseEntity;
import com.milobeene.starlog.tag.domain.Tag;
import jakarta.persistence.*;
import lombok.Getter;

// @ManyToMany 대신 조인 엔티티 (초안 §2.5)
@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_backlog_entry_tag",
        columnNames = {"backlog_entry_id", "tag_id"}))
public class BacklogEntryTag extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "backlog_entry_id", nullable = false)
    private BacklogEntry backlogEntry;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tag_id", nullable = false)
    private Tag tag;

    /**
     * JPA 전용 기본 생성자
     */
    protected BacklogEntryTag() {}

    public BacklogEntryTag(BacklogEntry backlogEntry, Tag tag) {
        this.backlogEntry = backlogEntry;
        this.tag = tag;
    }
}