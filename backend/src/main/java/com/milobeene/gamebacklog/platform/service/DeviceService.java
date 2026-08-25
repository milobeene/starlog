package com.milobeene.gamebacklog.platform.service;

import com.milobeene.gamebacklog.common.exception.ConflictException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.repository.DeviceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * 내 기기 (FR-PLT-03).
 *
 * 마스터에서 고르는 게 아니라 유형·라벨을 직접 적는다. 라벨이 정체성이라
 * 중복 검사도 라벨 기준이다 — 같은 "Nintendo Switch" 두 대를 "거실"·"침실"로 나눠 가질 수 있다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DeviceService {

    private static final String NOT_FOUND = "기기를 찾을 수 없습니다";

    private final DeviceRepository deviceRepository;
    private final MemberRepository memberRepository;

    /** 추가. 지웠던 라벨을 다시 넣으면 되살리고 유형·메모를 새 값으로 덮는다 */
    @Transactional
    public Long register(Long memberId, String deviceType, String label, String memo) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
        String normalized = TextValues.require(label, "기기 라벨은 비울 수 없습니다");

        Optional<Device> existing = deviceRepository.findByMemberIdAndLabel(memberId, normalized);
        if (existing.isPresent()) {
            Device found = existing.get();
            if (!found.isDeleted()) {
                throw new ConflictException("이미 있는 기기입니다: " + normalized);
            }
            found.revive();
            found.update(deviceType, normalized, memo);
            return found.getId();
        }

        Device device = new Device(member, deviceType, normalized, memo);
        deviceRepository.persist(device);

        return device.getId();
    }

    @Transactional
    public void update(Long memberId, Long deviceId, String deviceType, String label, String memo) {
        Device device = findOwnedAlive(memberId, deviceId);
        String normalized = TextValues.require(label, "기기 라벨은 비울 수 없습니다");

        // 검증을 변경보다 먼저 (원칙 14번) — 라벨에 유니크 제약이 걸려 있다
        deviceRepository.findByMemberIdAndLabel(memberId, normalized)
                .filter(other -> !other.getId().equals(deviceId))
                .ifPresent(other -> {
                    throw new ConflictException("이미 있는 기기입니다: " + normalized);
                });

        device.update(deviceType, normalized, memo);
    }

    /** 소프트 삭제. 이 기기로 플레이한 과거 회차에는 계속 이름이 보인다 (§7.4) */
    @Transactional
    public void delete(Long memberId, Long deviceId) {
        findOwnedAlive(memberId, deviceId).softDelete(LocalDateTime.now());
    }

    public List<Device> findSelectable(Long memberId) {
        return deviceRepository.findByMemberIdAndDeletedAtIsNullOrderByLabelAsc(memberId);
    }

    /** 회차에 붙일 때. 삭제된 기기도 돌려준다 — 그 기기로 했던 과거 회차를 수정할 수 있어야 한다 */
    public Device findOne(Long memberId, Long deviceId) {
        return OwnedCatalog.require(
                deviceRepository.findById(deviceId), memberId, NOT_FOUND + ". id=" + deviceId);
    }

    private Device findOwnedAlive(Long memberId, Long deviceId) {
        return OwnedCatalog.requireAlive(
                deviceRepository.findById(deviceId), memberId, NOT_FOUND + ". id=" + deviceId);
    }
}
