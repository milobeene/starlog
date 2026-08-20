package com.milobeene.gamebacklog.backlog.repository;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.common.repository.BaseRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface BacklogEntryRepository extends BaseRepository<BacklogEntry, Long> {

    /**
     * 이미 담은 게임인지 확인 (FR-BL-02, uk_backlog_entry_member_game).
     * 삭제된 행까지 포함해서 찾는다 — 되살리기(§7.4)가 삭제된 행을 찾아야 하므로
     * deletedAt 조건을 일부러 걸지 않는다. 살아있는 항목만 필요한 조회는 A-6에서 따로 만든다.
     *
     * 이름 파싱에 맡기지 않고 @Query를 쓰는 이유 — 스프링이 IncludingDeleted를
     * 엔티티 속성명으로 해석하려다 실패한다
     */
    @Query("select b from BacklogEntry b" +
            " where b.member.id = :memberId and b.game.id = :gameId")
    Optional<BacklogEntry> findByMemberIdAndGameIdIncludingDeleted(
            @Param("memberId") Long memberId, @Param("gameId") Long gameId);

    /**
     * 단건 조회 — 삭제된 항목 제외 (A-6). BacklogService.findOne이 쓴다.
     * DeletedAtIsNull이 where deleted_at is null로 번역된다
     */
    Optional<BacklogEntry> findByIdAndDeletedAtIsNull(Long id);

    /**
     * 내 백로그 목록 — 삭제된 항목 제외, 표시명 순 (FR-QRY-05 기초).
     * 기본 정렬이 displayName인 이유 — L-2가 지정한 "최근 플레이순"은
     * lastPlayedOn이 슬라이스 B 전까지 전부 null이라 의미가 없다
     */
    List<BacklogEntry> findByMemberIdAndDeletedAtIsNullOrderByDisplayNameAsc(Long memberId);

    /**
     * 마스터 이름 전파 (A-7, FR-ADM-01). 이름 오버라이드가 없는 항목만 대상이다.
     *
     * 벌크 연산은 영속성 컨텍스트를 우회하고 엔티티 생명주기 콜백도 안 거친다
     * → updatedAt을 SET 절에 직접 써야 한다 (@LastModifiedDate가 안 돈다).
     * deletedAt 조건을 안 거는 이유 — 되살렸을 때 옛 이름이 나오면 안 된다.
     *
     * flushAutomatically: 실행 전 컨텍스트 전체를 flush. 자동 flush는 이 쿼리가
     * 건드리는 테이블(backlog_entry)과 겹치는 변경만 밀어내므로, 이게 없으면
     * 같은 트랜잭션에서 바꾼 Game.name이 안 밀린 채 clear에 날아간다.
     * clearAutomatically: 실행 후 컨텍스트를 비워 옛 displayName을 버린다
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update BacklogEntry b set b.displayName = :newName, b.updatedAt = :now" +
            " where b.game.id = :gameId and b.nameOverride is null")
    int updateDisplayNameByGameId(@Param("gameId") Long gameId,
                                  @Param("newName") String newName,
                                  @Param("now") LocalDateTime now);
}
