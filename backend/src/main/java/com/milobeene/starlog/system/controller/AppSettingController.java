package com.milobeene.starlog.system.controller;

import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.system.dto.AppSettingsResponse;
import com.milobeene.starlog.system.dto.IgdbTestResult;
import com.milobeene.starlog.system.service.AppSettingService;
import com.milobeene.starlog.system.service.IgdbConnectionTester;
import com.milobeene.starlog.system.service.TranslationConnectionTester;
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
    private final TranslationConnectionTester translationConnectionTester;

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
     * 하루 할당량 저장 (2026-08-29).
     *
     * 빈 문자열이면 **지운다** — "설정 안 함"이 유효한 상태다.
     * 화면은 값이 없으면 게이지 대신 안내를 띄운다
     */
    public record DailyLimitRequest(String dailyChars) {}

    @PutMapping("/translate/daily-limit")
    public void updateDailyLimit(@RequestBody DailyLimitRequest request) {
        String raw = request.dailyChars() == null ? "" : request.dailyChars().strip();
        if (raw.isEmpty()) {
            appSettingService.put(AppSettingService.TRANSLATE_DAILY_CHARS, "");
            return;
        }
        long value;
        try {
            value = Long.parseLong(raw);
        } catch (NumberFormatException e) {
            throw new InvalidInputException("하루 할당량은 숫자여야 합니다");
        }
        /*
         * ⚠️ 음수와 월 한도 초과를 막는다 (사용자 요청). 음수면 게이지가 뒤집히고,
         * 월 한도보다 큰 하루 한도는 **하루에 다 쓸 수 있다는 뜻이 되어** 앞뒤가 안 맞는다
         */
        if (value <= 0) {
            throw new InvalidInputException("하루 할당량은 0보다 커야 합니다");
        }
        if (value > TranslationQuota.GUARD_MONTHLY_CHARS) {
            throw new InvalidInputException(
                    "하루 할당량은 월 한도(%,d자)를 넘을 수 없습니다".formatted(
                            TranslationQuota.GUARD_MONTHLY_CHARS));
        }
        appSettingService.put(AppSettingService.TRANSLATE_DAILY_CHARS, String.valueOf(value));
    }

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
     * 번역 키 확인 — **글자를 한 자도 안 쓴다** (2026-08-28).
     *
     * `languages`(지원 언어 목록)를 부른다. 값이 매겨지는 건 번역하려고 보낸 글자인데
     * 이 호출은 보낼 글자가 아예 없다. IGDB·스토리지와 달리 **번역은 테스트가 곧 돈이 될 수
     * 있어서** 무엇으로 시험하느냐가 설계의 일부다
     */
    @PostMapping("/translate/test")
    public TranslationConnectionTester.Result testTranslate(@RequestBody TranslateKeyRequest request) {
        return translationConnectionTester.test(request.apiKey());
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
