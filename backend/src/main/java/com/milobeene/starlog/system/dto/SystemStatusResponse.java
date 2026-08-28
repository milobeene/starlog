package com.milobeene.starlog.system.dto;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 시스템 화면이 한 번에 받는 것 (v1.0 8단계).
 *
 * **페이징이 없다** — 값이 한 화면에 다 들어간다.
 */
public record SystemStatusResponse(

        /** 외부 API 사용량. 지금은 IGDB와 스토리지 둘 */
        List<ApiUsage> apiUsage,

        StorageStatus storage,

        DatabaseStatus database,

        /** 호출 기록 보존 기간. 화면이 "N일치만 보관합니다"로 쓴다 */
        int retentionDays,

        /**
         * 번역 사용량 (2026-08-28).
         *
         * ⚠️ **다른 API와 단위가 다르다** — 나머지는 호출 횟수인데 이건 **글자 수**고,
         * 넘으면 거절이 아니라 **요금**이다. 그래서 `apiUsage` 목록에 끼워 넣지 않고
         * 따로 준다. 같은 모양으로 나란히 두면 "1분에 몇 건"과 같은 종류로 읽힌다
         */
        TranslationUsage translation
) {

    /**
     * `guardChars`(우리가 막는 선 45만)와 `freeChars`(구글의 공짜 한도 50만)가 다르다.
     * 사이의 5만은 **우리가 적게 셀 수 있는 오차**를 위한 여유다
     */
    public record TranslationUsage(long usedChars, long guardChars,
                                   long freeChars, long remainingChars) {}

    /**
     * 한 API의 사용량.
     *
     * **한도(limit)를 서버가 안 준다.** 벤더가 언제든 바꾸고 우리가 조회할 방법도 없어서,
     * 서버가 숫자를 주면 그게 조용히 거짓말이 된다. 화면이 상수로 들고 있고
     * **"언제 기준"인지를 함께 표시한다**
     */
    public record ApiUsage(
            String provider,
            long lastMinute,
            long lastHour,
            long lastDay,
            long lastMonth,
            long failedLastDay,
            /** 기록이 시작된 시점. null이면 아직 한 번도 안 불렀다 */
            LocalDateTime since
    ) {}

    public record StorageStatus(long coverCount, long totalBytes, boolean configured) {}

    /** sizeBytes는 PostgreSQL에서만 나온다. H2(로컬 모드)에서는 파일 크기를 쓴다 */
    public record DatabaseStatus(String product, Long sizeBytes) {}
}
