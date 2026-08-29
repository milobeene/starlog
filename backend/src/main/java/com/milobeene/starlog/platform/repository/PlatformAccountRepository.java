package com.milobeene.starlog.platform.repository;

import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.platform.domain.PlatformAccount;

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

    /** 회차·취득 입력 시 고를 수 있는 계정. 삭제된 건 선택지에서 빠진다 */
    List<PlatformAccount> findByMemberIdAndDeletedAtIsNullOrderByAccountLabelAsc(Long memberId);

    /** 플랫폼을 지울 때 딸린 계정도 함께 닫기 위해 (§6.5) */
    List<PlatformAccount> findByPlatformIdAndDeletedAtIsNull(Long platformId);
}
