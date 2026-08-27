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
    STORAGE
}
