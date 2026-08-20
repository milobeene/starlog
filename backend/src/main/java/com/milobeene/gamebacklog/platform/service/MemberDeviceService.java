package com.milobeene.gamebacklog.platform.service;

import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.member.repository.MemberRepository;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.MemberDevice;
import com.milobeene.gamebacklog.platform.repository.DeviceRepository;
import com.milobeene.gamebacklog.platform.repository.MemberDeviceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 보유 기기 (FR-PLT-03). 입력 편의용이지 제약이 아니다 —
 * 회차의 기기는 Device 마스터 전체에서 고를 수 있다 (BR-PT-05)
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberDeviceService {

    private final MemberDeviceRepository memberDeviceRepository;
    private final DeviceRepository deviceRepository;
    private final MemberRepository memberRepository;

    @Transactional
    public Long register(Long memberId, Long deviceId, String label, String memo) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("회원을 찾을 수 없습니다. id=" + memberId));
        Device device = deviceRepository.findById(deviceId)
                .orElseThrow(() -> new IllegalArgumentException("기기를 찾을 수 없습니다. id=" + deviceId));

        MemberDevice memberDevice = new MemberDevice(member, device, label);

        // 유니크 (member, device, label). 앱 검증은 최선 노력이고 진짜 방어선은 DB다
        memberDeviceRepository
                .findByMemberIdAndDeviceIdAndLabel(memberId, deviceId, memberDevice.getLabel())
                .ifPresent(existing -> {
                    throw new IllegalStateException("이미 등록된 기기입니다: " + memberDevice.getLabel());
                });

        memberDevice.updateMemo(memo);
        memberDeviceRepository.persist(memberDevice);

        return memberDevice.getId();
    }

    @Transactional
    public void update(Long memberId, Long memberDeviceId, String label, String memo) {
        MemberDevice memberDevice = findOwned(memberId, memberDeviceId);

        memberDevice.rename(label);
        memberDevice.updateMemo(memo);
    }

    /** 물리 삭제. 회차가 참조하는 건 Device 마스터라 보존할 이유가 없다 (§7.4) */
    @Transactional
    public void delete(Long memberId, Long memberDeviceId) {
        memberDeviceRepository.delete(findOwned(memberId, memberDeviceId));
    }

    public List<MemberDevice> findAll(Long memberId) {
        return memberDeviceRepository.findByMemberIdOrderByLabelAsc(memberId);
    }

    private MemberDevice findOwned(Long memberId, Long memberDeviceId) {
        MemberDevice memberDevice = memberDeviceRepository.findById(memberDeviceId)
                .orElseThrow(() -> new IllegalArgumentException("보유 기기를 찾을 수 없습니다. id=" + memberDeviceId));

        if (!memberDevice.getMember().getId().equals(memberId)) {
            throw new IllegalStateException("내 기기가 아닙니다. id=" + memberDeviceId);
        }

        return memberDevice;
    }
}
