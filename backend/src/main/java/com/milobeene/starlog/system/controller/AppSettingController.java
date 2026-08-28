package com.milobeene.starlog.system.controller;

import com.milobeene.starlog.system.dto.AppSettingsResponse;
import com.milobeene.starlog.system.dto.IgdbTestResult;
import com.milobeene.starlog.system.service.AppSettingService;
import com.milobeene.starlog.system.service.IgdbConnectionTester;
import com.milobeene.starlog.system.service.TranslationQuota;
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
    private final TranslationQuota translationQuota;

    @GetMapping
    public AppSettingsResponse get() {
        AppSettingService.IgdbCredentials igdb = appSettingService.igdb();
        boolean stored = appSettingService.all().containsKey(AppSettingService.IGDB_CLIENT_ID);
        TranslationQuota.Usage used = translationQuota.usage();

        return new AppSettingsResponse(
                igdb.clientId(), igdb.clientSecret(), !stored,
                appSettingService.translateApiKey(),
                new AppSettingsResponse.TranslationUsage(
                        used.usedChars(), used.guardChars(),
                        used.freeChars(), used.remainingChars()));
    }

    public record IgdbRequest(@NotNull String clientId, @NotNull String clientSecret) {}

    @PutMapping("/igdb")
    public void updateIgdb(@RequestBody IgdbRequest request) {
        appSettingService.put(AppSettingService.IGDB_CLIENT_ID, request.clientId().strip());
        appSettingService.put(AppSettingService.IGDB_CLIENT_SECRET, request.clientSecret().strip());
    }

    public record TranslateKeyRequest(@NotNull String apiKey) {}

    /**
     * 번역 키 저장 (2026-08-28).
     *
     * 테스트 버튼을 안 붙인다 — **시험 삼아 한 번 부르는 것도 글자를 소모하고, 그게 곧 돈이다.**
     * 키가 틀렸는지는 실제로 번역할 때 알게 되고, 그때 구글이 주는 메시지를 그대로 보여준다
     */
    @PutMapping("/translate")
    public void updateTranslateKey(@RequestBody TranslateKeyRequest request) {
        appSettingService.put(AppSettingService.TRANSLATE_API_KEY, request.apiKey().strip());
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
