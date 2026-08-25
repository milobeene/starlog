package com.milobeene.starlog.backlog.domain;

import com.milobeene.starlog.common.entity.BaseEntity;
import jakarta.persistence.*;
import lombok.Getter;

/**
 * 개인 업로드 커버 (Phase 5, FR-MED-01).
 *
 * **URL을 저장하지 않고 storageKey만 둔다.** URL은 publicBaseUrl + key로 조합 가능하고,
 * 저장해두면 도메인·CDN이 바뀔 때 전 행을 갱신해야 한다. Game.coverImageId와 같은 판단이다.
 *
 * ⚠️ FK를 가진 이쪽이 @OneToOne 주인이다. mappedBy 쪽 @OneToOne은 지연 로딩이 안 된다 —
 * 값이 있는지 알아야 프록시를 만들지 결정하는데, FK가 없는 쪽은 그걸 모르기 때문이다 (설계서 ⚠️5).
 *
 * 그래서 **BacklogEntry에는 역방향 필드를 두지 않는다.** 커버가 필요하면 리포지토리로 읽고,
 * 목록은 entryId를 모아 IN으로 한 번에 가져온다 — 항목마다 SELECT가 나가는 것을 원천 차단
 */
@Getter
@Entity
@Table(uniqueConstraints = @UniqueConstraint(
        name = "uk_cover_image_backlog_entry",
        columnNames = "backlog_entry_id"))
public class CoverImage extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "backlog_entry_id", nullable = false)
    private BacklogEntry backlogEntry;

    @Column(nullable = false, length = 300)
    private String storageKey;

    @Column(nullable = false, length = 100)
    private String contentType;

    @Column(nullable = false)
    private long sizeBytes;

    /**
     * JPA 전용 기본 생성자
     */
    protected CoverImage() {}

    public static CoverImage of(BacklogEntry backlogEntry, String storageKey,
                                String contentType, long sizeBytes) {
        CoverImage cover = new CoverImage();
        cover.backlogEntry = backlogEntry;
        cover.storageKey = storageKey;
        cover.contentType = contentType;
        cover.sizeBytes = sizeBytes;
        return cover;
    }

    /**
     * 교체 (FR-MED-03). 행을 지우고 다시 만들지 않는 이유 —
     * @OneToOne unique 제약 때문에 DELETE와 INSERT 사이 순서에 민감해진다.
     * 같은 행의 값만 바꾸면 그 문제가 없다.
     *
     * @return 스토리지에서 지워야 할 예전 key
     */
    public String replaceWith(String storageKey, String contentType, long sizeBytes) {
        String previousKey = this.storageKey;

        this.storageKey = storageKey;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;

        return previousKey;
    }
}
