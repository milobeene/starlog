package com.milobeene.gamebacklog.platform.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.platform.domain.Platform;

import java.util.List;
import java.util.Optional;

public interface PlatformRepository extends BaseRepository<Platform, Long> {

    /** 선택지·설정 목록. 삭제된 건 빠진다 */
    List<Platform> findByMemberIdAndDeletedAtIsNullOrderByNameAsc(Long memberId);

    /** 중복 검사용. 삭제된 행도 uk_platform에 걸리므로 포함해서 찾는다 */
    Optional<Platform> findByMemberIdAndName(Long memberId, String name);
}
