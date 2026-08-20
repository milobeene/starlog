package com.milobeene.gamebacklog.backlog.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;

@Getter
@Entity
public class CoverImage extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 1:1은 FK를 가진 쪽(여기)이 주인이어야 지연 로딩이 동작한다 (초안 ⚠️5)
    // 1:1의 unique는 @OneToOne이 스스로 만든다. @Table로 이름을 주려 해도
    // 같은 컬럼이라 중복 판정되어 무시된다 → 이름 없는 제약으로 남음 (Phase 9 OI-16에서 처리)
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "backlog_entry_id", nullable = false, unique = true)
    private BacklogEntry backlogEntry;

    @Column(nullable = false, length = 500)
    private String storageKey;

    @Column(nullable = false, length = 1000)
    private String url;

    @Column(length = 100)
    private String contentType;

    private Long sizeBytes;

    /**
     * JPA 전용 기본 생성자
     */
    protected CoverImage() {}

    public CoverImage(BacklogEntry backlogEntry, String storageKey, String url) {
        this.backlogEntry = backlogEntry;
        this.storageKey = storageKey;
        this.url = url;
    }
}