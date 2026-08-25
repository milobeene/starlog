package com.milobeene.starlog.platform.repository;

import com.milobeene.starlog.common.repository.BaseRepository;
import com.milobeene.starlog.platform.domain.Device;

import java.util.List;
import java.util.Optional;

public interface DeviceRepository extends BaseRepository<Device, Long> {

    /** 선택지·설정 목록. 삭제된 건 빠진다 */
    List<Device> findByMemberIdAndDeletedAtIsNullOrderByLabelAsc(Long memberId);

    /** 중복 검사용. 삭제된 행도 uk_device에 걸리므로 포함해서 찾는다 */
    Optional<Device> findByMemberIdAndLabel(Long memberId, String label);
}
