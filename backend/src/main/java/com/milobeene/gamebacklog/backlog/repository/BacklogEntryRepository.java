package com.milobeene.gamebacklog.backlog.repository;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.backlog.dto.StatusCount;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
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
     * 목록 카드 (H-2). 카드가 쓰는 ~ToOne을 전부 join fetch로 끌고 온다.
     *
     * 컬렉션은 하나도 안 붙였다 — 컬렉션 페치 조인은 DB에서 행이 뻥튀기되므로
     * Hibernate가 limit을 못 걸고 전체를 메모리로 올린 뒤 자른다(페이징이 깨진다, §6.8).
     * 장르는 그래서 batch size로 따로 받는다.
     *
     * countQuery를 직접 준 이유 — 안 주면 스프링이 join fetch가 붙은 채로 count를 만든다.
     * 참고로 총 개수가 페이지 크기보다 작으면 스프링이 count 쿼리를 아예 생략한다.
     *
     * order by가 없는 이유 — 정렬은 BacklogSort가 Sort로 만들어 Pageable에 실어 보낸다
     */
    @Query(value = "select b from BacklogEntry b" +
            " join fetch b.game" +
            " left join fetch b.lastPlaythrough p" +
            " left join fetch p.device" +
            " left join fetch p.emulator" +
            " where b.member.id = :memberId and b.deletedAt is null",
            countQuery = "select count(b) from BacklogEntry b" +
                    " where b.member.id = :memberId and b.deletedAt is null")
    Page<BacklogEntry> findCards(@Param("memberId") Long memberId, Pageable pageable);

    /**
     * 상세 단건 (H-2). game을 join fetch 하는 이유 — 상세는 마스터 원본을 그대로 내보내므로
     * 어차피 전부 읽는다. 프록시로 두면 첫 접근에서 한 방이 더 나간다
     */
    @Query("select b from BacklogEntry b join fetch b.game" +
            " where b.id = :entryId and b.deletedAt is null")
    Optional<BacklogEntry> findDetailById(@Param("entryId") Long entryId);

    /** 상태별 항목 수 (H-4) */
    @Query("select new com.milobeene.gamebacklog.backlog.dto.StatusCount(b.status, count(b))" +
            " from BacklogEntry b" +
            " where b.member.id = :memberId and b.deletedAt is null" +
            " group by b.status" +
            " order by b.status asc")
    List<StatusCount> countByStatus(@Param("memberId") Long memberId);

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

    /**
     * 마스터 출시일 전파 — updateDisplayNameByGameId와 대칭이다.
     * 오버라이드가 있는 항목은 건드리지 않고, 소프트 삭제된 행도 포함한다
     * (되살렸을 때 옛 날짜로 정렬되면 안 된다).
     * 호출 경로는 GameService.syncMasterInfo 하나뿐이어야 한다
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update BacklogEntry b set b.releasedOnResolved = :newDate, b.updatedAt = :now" +
            " where b.game.id = :gameId and b.releasedOnOverride is null")
    int updateReleasedOnResolvedByGameId(@Param("gameId") Long gameId,
                                         @Param("newDate") LocalDate newDate,
                                         @Param("now") LocalDateTime now);
}
