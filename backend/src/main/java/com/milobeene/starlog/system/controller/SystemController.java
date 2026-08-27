package com.milobeene.starlog.system.controller;

import com.milobeene.starlog.system.dto.SystemStatusResponse;
import com.milobeene.starlog.system.service.SystemStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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

    @GetMapping
    public SystemStatusResponse status() {
        return systemStatusService.status();
    }
}
