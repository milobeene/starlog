package com.milobeene.gamebacklog.platform.repository;

import com.milobeene.gamebacklog.common.repository.BaseRepository;
import com.milobeene.gamebacklog.platform.domain.MemberDevice;

import java.util.List;
import java.util.Optional;

public interface MemberDeviceRepository extends BaseRepository<MemberDevice, Long> {

    /** 보유 기기는 물리 삭제라 소프트 삭제 조건이 없다 (§7.4) */
    List<MemberDevice> findByMemberIdOrderByLabelAsc(Long memberId);

    Optional<MemberDevice> findByMemberIdAndDeviceIdAndLabel(
            Long memberId, Long deviceId, String label);
}
