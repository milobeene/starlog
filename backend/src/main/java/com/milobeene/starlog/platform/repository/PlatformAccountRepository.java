package com.milobeene.starlog.platform.repository;

import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PlatformAccountRepository extends BaseRepository<PlatformAccount, Long> {

    /**
     * 재등록 3분기용 (§7.4). 삭제된 행도 uk_platform_account에 걸리므로 포함해서 찾는다.
     * findById도 삭제된 것을 그대로 반환한다 — 과거 회차·취득을 볼 때 계정 이름이 나와야 하기 때문
     */
    /**
     * 소속(플랫폼 또는 에뮬)과 라벨로 찾는다 — `uk_platform_account`와 짝이다 (v1.1).
     *
     * ⚠️ platform_id로 찾던 것을 **owner_key로 바꿨다.** 에뮬 계정이 생기면서
     * 플랫폼만으로는 짝을 못 짓는다 — 유니크가 owner_key를 보므로 조회도 같아야
     * "있는데 못 찾아 만들다 제약에 걸리는" 상태가 안 생긴다
     */
    Optional<PlatformAccount> findByMemberIdAndOwnerKeyAndAccountLabel(
            Long memberId, String ownerKey, String accountLabel);

    Optional<PlatformAccount> findByMemberIdAndPlatformIdAndAccountLabel(
            Long memberId, Long platformId, String accountLabel);

    /**
     * 회차·취득 입력 시 고를 수 있는 계정. 삭제된 건 선택지에서 빠진다.
     *
     * **소속으로 묶어 정렬한다** (v1.2). 라벨만으로 정렬하면 스팀 계정과 닌텐도 계정이
     * 이름순으로 뒤섞여, 선택지가 `Beene (GOG)` `Beene (Steam)` `Milo (GOG)`처럼
     * 소속을 오간다 — 고를 때 눈이 계속 되돌아간다. 화면에 붙는 이름이
     * `라벨 (소속)`이라 정렬 키도 소속을 앞에 둔다.
     *
     * `coalesce`인 이유 — 계정의 소속은 **플랫폼이거나 에뮬이거나 하나뿐이다** (V11).
     * `left join`이라 소속이 없는 행도 안 사라진다 (nulls는 DB마다 위아래가 갈리지만
     * 있을 수 없는 상태라 신경 쓰지 않는다).
     *
     * ⚠️ **join fetch가 붙은 이유는 정렬이 아니다** — 호출부가 계정마다 소속 이름을
     * 꺼내 라벨을 만든다. 프록시로 두면 계정 수만큼 쿼리가 더 나간다 (JPA 원칙 4번)
     */
    @Query("select a from PlatformAccount a"
            + " left join fetch a.platform p"
            + " left join fetch a.emulator e"
            + " where a.member.id = :memberId and a.deletedAt is null"
            + " order by coalesce(p.name, e.name) asc, a.accountLabel asc, a.id asc")
    List<PlatformAccount> findSelectable(@Param("memberId") Long memberId);

    /** 플랫폼을 지울 때 딸린 계정도 함께 닫기 위해 (§6.5) */
    List<PlatformAccount> findByPlatformIdAndDeletedAtIsNull(Long platformId);
}
