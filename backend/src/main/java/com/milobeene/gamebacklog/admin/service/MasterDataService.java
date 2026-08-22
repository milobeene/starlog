package com.milobeene.gamebacklog.admin.service;

import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.Emulator;
import com.milobeene.gamebacklog.platform.domain.Platform;
import com.milobeene.gamebacklog.platform.repository.DeviceRepository;
import com.milobeene.gamebacklog.platform.repository.EmulatorRepository;
import com.milobeene.gamebacklog.platform.repository.PlatformRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 플랫폼·기기·에뮬레이터 마스터 관리 (FR-ADM-04).
 *
 * **삭제가 없다** (§7.4). 회차·취득이 참조하고 있어서 지우면 과거 기록이 깨진다.
 * 오타는 이름 수정으로 고친다 — 그래서 rename이 필요했다.
 *
 * 중복 이름은 DB 유니크 제약이 최종 방어선이고, 여기 검증은 최선 노력이다 (원칙 7번).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MasterDataService {

    private final PlatformRepository platformRepository;
    private final DeviceRepository deviceRepository;
    private final EmulatorRepository emulatorRepository;

    @Transactional
    public Long createPlatform(String name) {
        Platform platform = Platform.of(require(name));
        platformRepository.persist(platform);
        return platform.getId();
    }

    @Transactional
    public void renamePlatform(Long platformId, String name) {
        platformRepository.findById(platformId)
                .orElseThrow(() -> new NotFoundException("플랫폼을 찾을 수 없습니다. id=" + platformId))
                .rename(require(name));
    }

    @Transactional
    public Long createDevice(String name) {
        Device device = Device.of(require(name));
        deviceRepository.persist(device);
        return device.getId();
    }

    @Transactional
    public void renameDevice(Long deviceId, String name) {
        deviceRepository.findById(deviceId)
                .orElseThrow(() -> new NotFoundException("기기를 찾을 수 없습니다. id=" + deviceId))
                .rename(require(name));
    }

    @Transactional
    public Long createEmulator(String name) {
        Emulator emulator = Emulator.of(require(name));
        emulatorRepository.persist(emulator);
        return emulator.getId();
    }

    @Transactional
    public void renameEmulator(Long emulatorId, String name) {
        emulatorRepository.findById(emulatorId)
                .orElseThrow(() -> new NotFoundException("에뮬레이터를 찾을 수 없습니다. id=" + emulatorId))
                .rename(require(name));
    }

    private String require(String name) {
        String normalized = TextValues.normalize(name);
        if (normalized == null) {
            throw new InvalidInputException("이름은 비울 수 없습니다");
        }
        return normalized;
    }
}
