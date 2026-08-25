package com.milobeene.gamebacklog.member.domain;

import com.milobeene.gamebacklog.common.entity.BaseEntity;
import com.milobeene.gamebacklog.common.exception.ConflictException;
import jakarta.persistence.Column;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MappedSuperclass;
import lombok.Getter;

import java.time.LocalDateTime;

/**
 * 회원이 소유하는 선택지(플랫폼·기기·에뮬레이터·인풋 메서드·플랫폼 계정)의 공통 뼈대.
 *
 * 이 다섯은 **전부 회차나 취득이 참조한다.** 그래서 물리 삭제가 없다 —
 * 지우면 과거 기록에서 "무엇으로 플레이했는지"가 통째로 비어버린다.
 * 대신 deletedAt을 찍어 선택지에서만 빼고, 지난 기록에는 "(삭제됨)"으로 계속 보인다 (§7.4).
 *
 * `@MappedSuperclass`는 테이블이 되지 않는다. 여기 선언한 member·deletedAt이
 * 상속받는 다섯 엔티티의 **각자 테이블에 컬럼으로 복사**될 뿐이다
 */
@Getter
@MappedSuperclass
public abstract class MemberOwnedEntity extends BaseEntity {

    // FK를 가진 쪽 = 연관관계의 주인. LAZY를 반드시 명시한다 (ToOne 기본값은 EAGER)
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /**
     * JPA 전용 기본 생성자
     */
    protected MemberOwnedEntity() {}

    protected MemberOwnedEntity(Member member) {
        this.member = member;
    }

    /** 선택지 목록과 과거 기록에 찍히는 이름. 유니크 제약이 걸린 컬럼과 같은 값이어야 한다 */
    public abstract String displayName();

    public void softDelete(LocalDateTime deletedAt) {
        if (isDeleted()) {
            throw new ConflictException("이미 삭제되었습니다: " + displayName());
        }
        this.deletedAt = deletedAt;
    }

    public void revive() {
        if (!isDeleted()) {
            throw new ConflictException("삭제되지 않았습니다: " + displayName());
        }
        this.deletedAt = null;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public boolean isOwnedBy(Long memberId) {
        return member.getId().equals(memberId);
    }
}
