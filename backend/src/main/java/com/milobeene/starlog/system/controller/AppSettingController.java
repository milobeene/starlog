package com.milobeene.starlog.system.controller;

import com.milobeene.starlog.system.dto.AppSettingsResponse;
import com.milobeene.starlog.system.dto.IgdbTestResult;
import com.milobeene.starlog.system.service.AppSettingService;
import com.milobeene.starlog.system.service.IgdbConnectionTester;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 앱 설정 (2026-08-28).
 *
 * **IGDB 키가 여기 있는 이유** — architecture §2의 경계표대로다. DB·스토리지는 부팅 때
 * 조립되므로 일렉트론이 갖고, **IGDB는 런타임에 바꿔도 되므로 앱 안**이다.
 * 그래서 로컬 모드에서도 검색을 쓸 수 있다 — 예전엔 키가 연결 설정에만 있어서 못 썼다.
 */
@RestController
@RequestMapping("/api/system/settings")
@RequiredArgsConstructor
public class AppSettingController {

    private final AppSettingService appSettingService;
    private final IgdbConnectionTester igdbConnectionTester;

    @GetMapping
    public AppSettingsResponse get() {
        AppSettingService.IgdbCredentials igdb = appSettingService.igdb();
        boolean stored = appSettingService.all().containsKey(AppSettingService.IGDB_CLIENT_ID);
        return new AppSettingsResponse(igdb.clientId(), igdb.clientSecret(), !stored);
    }

    public record IgdbRequest(@NotNull String clientId, @NotNull String clientSecret) {}

    @PutMapping("/igdb")
    public void updateIgdb(@RequestBody IgdbRequest request) {
        appSettingService.put(AppSettingService.IGDB_CLIENT_ID, request.clientId().strip());
        appSettingService.put(AppSettingService.IGDB_CLIENT_SECRET, request.clientSecret().strip());
    }

    /**
     * 연결 테스트.
     *
     * **저장하지 않은 값으로 시험한다.** 저장부터 하면 틀린 키가 들어간 뒤에야 알게 되고,
     * 그 사이 검색이 전부 502가 된다
     */
    @PostMapping("/igdb/test")
    public IgdbTestResult testIgdb(@RequestBody IgdbRequest request) {
        return igdbConnectionTester.test(request.clientId(), request.clientSecret());
    }
}
