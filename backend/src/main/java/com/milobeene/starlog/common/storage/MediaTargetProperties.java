package com.milobeene.starlog.common.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 무엇을 스토리지에 올릴 것인가 (v1.0 6·7단계, 사용자 결정 2026-08-28).
 *
 * ## 왜 설정으로 두나
 *
 * "자격증명이 있으면 스토리지"로 자동 판정하려 했는데, **커버와 스크린샷의 사정이 다르다.**
 * 커버는 몇 KB짜리라 어디 둬도 되지만 스크린샷은 장당 2~5MB에 수백 장이라
 * 무료 티어 버킷이 먼저 찬다. 하나로 묶으면 "커버만 클라우드에"가 표현이 안 된다.
 *
 * 그래서 **체크박스 둘**이고, 화면에는 "체크 안 한 것은 이 폴더에 저장됩니다"가 함께 뜬다.
 * 값은 일렉트론이 연결 설정에서 읽어 환경변수로 넘긴다 (`STARLOG_MEDIA_*`).
 *
 * ⚠️ **자격증명이 없으면 체크가 있어도 무시된다** — 올릴 데가 없는데 켜져 있으면
 * 업로드가 502로 실패할 뿐이다. 판정은 `MediaTargets`가 한다
 */
@ConfigurationProperties(prefix = "starlog.media")
public record MediaTargetProperties(boolean useStorageForCovers,
                                    boolean useStorageForScreenshots) {

    public MediaTargetProperties {
        // 안 넘어오면 로컬. 아무것도 설정 안 한 사람이 바로 쓸 수 있어야 한다 (§1 로컬 모드가 기본)
    }
}
