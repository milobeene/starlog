package com.milobeene.starlog.backlog.repository;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.backlog.dto.BacklogNameResponse;
import com.milobeene.starlog.backlog.dto.DeletedEntryResponse;
import com.milobeene.starlog.backlog.dto.FacetCount;
import com.milobeene.starlog.backlog.dto.StatusCount;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface BacklogEntryRepository
        extends BaseRepository<BacklogEntry, Long>, BacklogEntryRepositoryCustom {

    /**
     * 회차 검증을 직렬화하기 위한 부모 행 잠금.
     *
     * BR-PT-02(기간 겹침 금지)·BR-PT-03(진행 중 1개)은 **형제 회차를 봐야 판정되는 규칙**이라
     * DB 제약으로 표현할 수 없다(부분 유니크 인덱스는 H2가 미지원이라 dev/prod가 갈린다).
     * 그래서 항목 행을 잠가 "형제를 읽고 → 검증하고 → 쓰는" 구간을 한 번에 하나만 돌게 한다.
     * 잠그지 않으면 동시 요청 둘이 서로의 미커밋 회차를 못 보고 둘 다 통과해
     * 불변식이 깨진 데이터가 영구 저장되고, 이후 정상 수정까지 409로 연쇄된다
     */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from BacklogEntry b where b.id = :entryId")
    java.util.Optional<BacklogEntry> findByIdForUpdate(@Param("entryId") Long entryId);

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
     * 사이드바 전체 목록 (Phase 8) — id와 이름만 뽑는다.
     *
     * 생성자 표현식이라 엔티티를 영속성 컨텍스트에 올리지 않는다 — select 절의
     * 두 컬럼만 읽고 끝이라 76건이든 수백 건이든 스냅샷 비용이 없다.
     * lower()는 영문 대소문자 정렬 때문 ('alba'가 'Baba' 뒤로 밀리면 안 된다),
     * id asc는 같은 이름을 지웠다 다시 담았을 때 순서 고정용이다
     */
    /**
     * 내보내기 전용 — **삭제된 항목까지 전부.**
     *
     * 백업은 "지금 보이는 것"이 아니라 "가진 것 전부"여야 한다. 삭제 상태(`deletedAt`)도
     * 그대로 옮겨서, 복원하면 휴지통까지 똑같이 재현된다.
     *
     * 게임을 join fetch 한다 — 항목마다 게임을 따로 읽으면 그게 N+1이다.
     * 나머지 연관(회차·취득·장르)은 컬렉션이라 페치 조인을 겹칠 수 없어 호출부가 따로 읽는다
     */
    @Query("select b from BacklogEntry b join fetch b.game"
            + " where b.member.id = :memberId order by b.id asc")
    List<BacklogEntry> findAllForExport(@Param("memberId") Long memberId);

    /**
     * 삭제한 항목 목록 (§7.4 되살리기).
     *
     * 최근에 지운 것부터 — 되살리려는 건 방금 잘못 지운 것일 확률이 높다.
     *
     * 2차 정렬로 id를 붙인다. 같은 초에 여러 개를 지우면 deletedAt이 같아져
     * 순서가 매 요청 흔들리고, 그러면 페이징에서 같은 행이 두 번 나오거나 아예 빠진다
     */
    @Query(value = "select new com.milobeene.starlog.backlog.dto.DeletedEntryResponse("
            + "   b.id, b.displayName, b.deletedAt)"
            + " from BacklogEntry b"
            + " where b.member.id = :memberId and b.deletedAt is not null"
            + " order by b.deletedAt desc, b.id desc",
            countQuery = "select count(b) from BacklogEntry b"
                    + " where b.member.id = :memberId and b.deletedAt is not null")
    Page<DeletedEntryResponse> findDeleted(@Param("memberId") Long memberId, Pageable pageable);

    @Query("select new com.milobeene.starlog.backlog.dto.BacklogNameResponse(b.id, b.displayName)" +
            " from BacklogEntry b" +
            " where b.member.id = :memberId and b.deletedAt is null" +
            " order by lower(b.displayName) asc, b.id asc")
    List<BacklogNameResponse> findNames(@Param("memberId") Long memberId);

    /**
     * 개발사 사전 (Phase 8) — 자동완성 선택지용. **표시값 기준**이라 두 방으로 나뉜다.
     *
     * 오버라이드가 있으면 그것만, 비어 있으면 마스터 것 (§7.1). 한 쿼리로 합치려면
     * 항목마다 분기가 갈려 SQL로 표현이 안 된다 — stats의 장르 분포가 두 방인 것과 같은 이유다
     */
    @Query("select distinct d from BacklogEntry b join b.developerOverrides d" +
            " where b.member.id = :memberId and b.deletedAt is null")
    List<String> findDeveloperOverrides(@Param("memberId") Long memberId);

    @Query("select distinct d from BacklogEntry b join b.game g join g.developers d" +
            " where b.member.id = :memberId and b.deletedAt is null" +
            " and b.developerOverrides is empty")
    List<String> findMasterDevelopers(@Param("memberId") Long memberId);

    @Query("select distinct p from BacklogEntry b join b.publisherOverrides p" +
            " where b.member.id = :memberId and b.deletedAt is null")
    List<String> findPublisherOverrides(@Param("memberId") Long memberId);

    @Query("select distinct p from BacklogEntry b join b.game g join g.publishers p" +
            " where b.member.id = :memberId and b.deletedAt is null" +
            " and b.publisherOverrides is empty")
    List<String> findMasterPublishers(@Param("memberId") Long memberId);

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
            " left join fetch b.tag" +
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
            " left join fetch b.tag" +
            " where b.id = :entryId and b.deletedAt is null")
    Optional<BacklogEntry> findDetailById(@Param("entryId") Long entryId);

    /** 상태별 항목 수 (H-4) */
    @Query("select new com.milobeene.starlog.backlog.dto.StatusCount(b.status, count(b))" +
            " from BacklogEntry b" +
            " where b.member.id = :memberId and b.deletedAt is null" +
            " group by b.status" +
            " order by b.status asc")
    List<StatusCount> countByStatus(@Param("memberId") Long memberId);

    /**
     * 태그별 항목 수 (H-4, 사이드바 그룹). 태그가 항목당 하나라 조인 테이블이 없어졌고,
     * 그래서 count(distinct)도 필요 없다 — 행 하나가 항목 하나다
     */
    @Query("select new com.milobeene.starlog.backlog.dto.FacetCount(" +
            "   b.tag.id, b.tag.name, count(b))" +
            " from BacklogEntry b" +
            " where b.member.id = :memberId and b.deletedAt is null and b.tag is not null" +
            " group by b.tag.id, b.tag.name, b.tag.sortOrder" +
            /*
             * ⚠️ **이름순이 아니라 사용자가 정한 순서다** (v1.1). 사이드바·폴더 탭이
             * 이 순서를 그대로 쓴다 — 화면마다 다르면 같은 목록으로 안 보인다
             */
            " order by b.tag.sortOrder asc, b.tag.name asc")
    List<FacetCount> countByTag(@Param("memberId") Long memberId);

    /**
     * 태그 삭제 전파 (FR-TAG-02). 조인 행을 지우던 자리를 벌크 update가 대신한다.
     *
     * 벌크는 영속성 컨텍스트를 우회한다 → updatedAt을 SET 절에 직접 쓰고
     * (@LastModifiedDate 콜백이 안 돈다), 실행 뒤 컨텍스트를 비워야
     * 뒤따르는 Tag 물리 삭제가 아직 tag를 물고 있는 항목과 충돌하지 않는다.
     * 소프트 삭제된 항목도 함께 떼는 이유 — 남겨두면 FK가 살아 있어 Tag를 못 지운다
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update BacklogEntry b set b.tag = null, b.updatedAt = :now where b.tag.id = :tagId")
    int clearTag(@Param("tagId") Long tagId, @Param("now") LocalDateTime now);

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
     * clearAutomatically: 실행 후 컨텍스트를 비워 옛 displayName을 버린다.
     *
     * ⚠️ **정렬 키도 여기서 같이 쓴다.** 엔티티의 refreshDisplayName()과 이 쿼리가
     * displayName을 바꾸는 두 경로인데, 벌크는 엔티티를 안 거치므로 콜백에 기댈 수 없다.
     * 한쪽만 고치면 **이름은 바뀌었는데 정렬만 옛 이름 자리에 남는다**
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update BacklogEntry b set b.displayName = :newName," +
            " b.displayNameSortKey = :sortKey, b.updatedAt = :now" +
            " where b.game.id = :gameId and b.nameOverride is null")
    int updateDisplayNameByGameId(@Param("gameId") Long gameId,
                                  @Param("newName") String newName,
                                  @Param("sortKey") String sortKey,
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

    /**
     * 병합 충돌 검사 (FR-ADM-02) — 같은 회원이 두 마스터를 **둘 다** 담고 있는 경우.
     * 그대로 옮기면 `(member, game)` 유니크 제약에 걸린다.
     * 소프트 삭제된 행도 센다 — 제약이 그것까지 보기 때문이다
     */
    @Query("""
            select b.member.id from BacklogEntry b
             where b.game.id in (:sourceGameId, :targetGameId)
             group by b.member.id
            having count(distinct b.game.id) = 2
            """)
    List<Long> findMemberIdsHavingBoth(@Param("sourceGameId") Long sourceGameId,
                                       @Param("targetGameId") Long targetGameId);

    /**
     * 마스터 병합 (FR-ADM-02) — 항목이 가리키는 게임을 갈아끼우고 비정규화를 다시 계산한다.
     * 오버라이드가 있는 항목은 표시값이 안 바뀌어야 하므로 coalesce·case로 분기한다
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update BacklogEntry b
               set b.game = :target,
                   b.displayName = coalesce(b.nameOverride, :targetName),
                   b.releasedOnResolved = case when b.releasedOnOverride is null
                                               then :targetReleasedOn else b.releasedOnOverride end,
                   b.updatedAt = :now
             where b.game.id = :sourceGameId
            """)
    int repointGame(@Param("sourceGameId") Long sourceGameId,
                    @Param("target") Game target,
                    @Param("targetName") String targetName,
                    @Param("targetReleasedOn") LocalDate targetReleasedOn,
                    @Param("now") LocalDateTime now);
}
