package com.milobeene.starlog.admin.controller;

import com.milobeene.starlog.admin.dto.SystemStatusResponse;
import com.milobeene.starlog.admin.service.SystemStatusService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * WEB-ONLY: 시스템 현황 (docs/capacity-planning.md §3).
 *
 * **`AdminController`에서 떼어낸 이유** — `SystemStatusService`가 `@Profile("!desktop")`인데
 * 이걸 `final` 필드로 물고 있는 컨트롤러에 프로필 게이트가 없으면,
 * `desktop` 프로필로 띄울 때 `NoSuchBeanDefinitionException`으로 **애플리케이션이 기동조차 안 된다.**
 * `NoOpQuotaGuard`를 만들어 둔 이유(로컬 앱 빌드가 그대로 떠야 한다)가 그 한 줄에서 깨졌다.
 *
 * 클래스를 통째로 지우면 되는 모양이라 WEB-ONLY 원칙과도 맞는다.
 */
@Profile("!desktop")
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminSystemController {

    private final SystemStatusService systemStatusService;

    /** 페이징이 없다 — 값이 한 화면에 다 들어간다. 오늘치 쿼터도 승인제라 길어질 일이 없다 */
    @GetMapping("/system")
    public SystemStatusResponse system() {
        return systemStatusService.status();
    }
}
