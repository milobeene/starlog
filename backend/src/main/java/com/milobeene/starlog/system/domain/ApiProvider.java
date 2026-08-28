package com.milobeene.starlog.system.domain;

/**
 * 사용량을 세는 외부 서비스.
 *
 * **한도를 여기 적어두지 않는다.** 한도는 벤더가 언제든 바꾸고 우리가 조회할 방법도 없어서,
 * 코드에 박아두면 조용히 거짓말이 된다. 화면이 **"언제 기준"인지와 함께** 표시한다
 * (`frontend/src/lib/apiLimits.ts`).
 */
public enum ApiProvider {

    /** 게임 마스터 데이터. Twitch OAuth를 거친다 */
    IGDB,

    /** 커버·스크린샷을 S3 호환 스토리지에 올리고 지우는 호출 */
    STORAGE,

    /**
     * 게임 소개문 번역 (Google Cloud Translation).
     *
     * ⚠️ **여기만 한도를 넘으면 돈이 나간다.** IGDB·스토리지는 넘으면 거절당하고 끝이지만
     * 구글의 무료 한도는 "여기까지 청구 안 함"이지 "여기서 멈춤"이 아니다.
     * 그래서 이 제공자만 **보내기 전에 미리 세어 막는다** (`TranslationQuota`)
     */
    TRANSLATE
}
