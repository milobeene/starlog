package com.milobeene.starlog.backlog.repository;

import com.milobeene.starlog.backlog.domain.Acquisition;
import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.backlog.dto.FacetCount;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AcquisitionRepository extends BaseRepository<Acquisition, Long> {

    /** 한 항목의 취득 전체. 재구매·DLC로 여러 건이 쌓인다 (FR-ACQ-06) */
    List<Acquisition> findByBacklogEntryIdOrderByIdAsc(Long backlogEntryId);

    /** 상세 화면용 (H-2). 회차와 같은 이유로 ~ToOne을 전부 끌고 온다 */
    @Query("select a from Acquisition a" +
            " left join fetch a.platform" +
            " left join fetch a.platformAccount" +
            " left join fetch a.subscription" +
            " where a.backlogEntry.id = :entryId" +
            " order by a.id asc")
    List<Acquisition> findAllWithReferences(@Param("entryId") Long entryId);

    /**
     * 플랫폼 계정별 항목 수 (H-4).
     *
     * 회차가 아니라 취득에서 세는 이유 — 계정 필터는 "그 계정으로 가진 게임"을 뜻한다.
     * 회차의 계정은 "그때 어느 계정으로 플레이했나"라서 의미가 다르다.
     * 삭제된 계정도 세지 않는다 — 선택지 목록에서 이미 빠져 고를 수 없기 때문이다
     */
    /*
     * 이름에 플랫폼을 붙여 내린다 — `Beene (Steam)`. 라벨만으로는 못 고른다:
     * 같은 라벨("Beene")을 여러 플랫폼에 쓰는 게 흔해서 선택지에 같은 글자가 여러 줄 뜬다.
     * FacetCount의 모양을 안 바꾸는 쪽을 택했다 — 필드를 늘리면 파셋 다섯 종이 전부 따라 바뀐다
     */
    /*
     * ⚠️ **조인을 명시로 바꿨다** (v1.2). `a.platformAccount.platform.name`은 암시적
     * **inner** 조인이라, V11 이후 생길 수 있는 **에뮬 소속 계정이 통째로 사라진다**
     * (platform이 null이니 조인이 안 붙는다). 필터 목록에는 있는데 파셋에만 없는
     * 상태가 되어, 눈으로는 "왜 이 계정만 개수가 안 나오지"로 보인다
     */
    @Query("select new com.milobeene.starlog.backlog.dto.FacetCount(" +
            "   pa.id," +
            "   concat('(', coalesce(p.name, e.name), ') ', pa.accountLabel)," +
            "   count(distinct a.backlogEntry.id))" +
            " from Acquisition a" +
            "   join a.platformAccount pa" +
            "   left join pa.platform p" +
            "   left join pa.emulator e" +
            " where a.backlogEntry.member.id = :memberId" +
            "   and a.backlogEntry.deletedAt is null" +
            "   and pa.deletedAt is null" +
            " group by pa.id, pa.accountLabel, p.name, e.name" +
            /*
             * 화면에 보이는 문자열 순서(`(GOG) Beene` → `(Steam) Beene`)와 맞추고
             * tie-break까지 준다. 라벨만으로 정렬하면 **concat을 붙인 바로 그 상황** —
             * 같은 라벨을 여러 플랫폼에 쓸 때 — 두 행의 정렬 키가 같아져 순서가 흔들린다
             */
            " order by coalesce(p.name, e.name) asc, pa.accountLabel asc, pa.id asc")
    List<FacetCount> countByPlatformAccount(@Param("memberId") Long memberId);
}
