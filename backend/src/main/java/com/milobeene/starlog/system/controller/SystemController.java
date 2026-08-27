package com.milobeene.starlog.system.controller;

import com.milobeene.starlog.common.storage.FileStoragePort;
import com.milobeene.starlog.system.dto.SystemStatusResponse;
import com.milobeene.starlog.system.service.SystemStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.Optional;

/**
 * 시스템 화면 (v1.0 8단계).
 *
 * `/api/admin`이 사라진 자리다. **인가가 없다** — 한 설치 = 한 사람이라 막을 상대가 없고,
 * 프로필 게이트(`@Profile("!desktop")`)도 필요 없다. 로컬 모드든 클라우드 모드든
 * 내 사용량은 내가 봐야 한다
 */
@RestController
@RequestMapping("/api/system")
@RequiredArgsConstructor
public class SystemController {

    private final SystemStatusService systemStatusService;
    private final FileStoragePort fileStorage;

    @GetMapping
    public SystemStatusResponse status() {
        return systemStatusService.status();
    }

    /**
     * 스토리지가 **실제로 되는지** 확인한다 (2026-08-28).
     *
     * `/api/system`의 `configured`와 다른 질문이다 — 그건 "값이 채워졌나"라
     * **비밀번호를 틀려도 true**였다. 여기는 버킷에 직접 닿아본다
     */
    @GetMapping("/storage/check")
    public Map<String, Object> checkStorage() {
        Optional<String> failure = fileStorage.checkAccess();
        return Map.of(
                "ok", failure.isEmpty(),
                "message", failure.orElse("버킷에 접근했습니다"));
    }
}
