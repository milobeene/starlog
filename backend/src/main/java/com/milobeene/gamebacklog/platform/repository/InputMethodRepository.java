package com.milobeene.gamebacklog.platform.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.platform.domain.InputMethod;

import java.util.List;
import java.util.Optional;

public interface InputMethodRepository extends BaseRepository<InputMethod, Long> {

    /** 선택지·설정 목록. 삭제된 건 빠진다 */
    List<InputMethod> findByMemberIdAndDeletedAtIsNullOrderByNameAsc(Long memberId);

    /** 중복 검사용. 삭제된 행도 uk_input_method에 걸리므로 포함해서 찾는다 */
    Optional<InputMethod> findByMemberIdAndName(Long memberId, String name);
}
