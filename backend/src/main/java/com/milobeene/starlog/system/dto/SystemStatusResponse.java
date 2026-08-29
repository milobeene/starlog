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
                                   long freeChars, long remainingChars,
                                   /** 오늘 쓴 글자 수 (2026-08-29) */
                                   long usedTodayChars,
                                   /**
                                    * 사람이 적어둔 하루 한도. **null이면 화면이 게이지를 안 그린다** —
                                    * 우리가 정한 값이 아니라 구글 콘솔 설정의 사본이라, 없는 걸
                                    * 기본값으로 채우면 근거 없는 선이 진짜처럼 보인다
                                    */
                                   Long dailyLimitChars) {}

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
    /**
     * 데이터 크기 (2026-08-29 개편).
     *
     * `sizeBytes`는 **내 테이블 합**이고 `totalBytes`가 DB 전체다. 클라우드에서
     * `pg_database_size`만 보여주면 **7MB가 PostgreSQL 시스템 카탈로그라 숫자가 안 움직인다** —
     * 게임을 넣어도 10.0MB 그대로여서 쓸모가 없었다(실측 확인).
     * 로컬(H2)에서는 둘 다 세이브파일 크기로 같다.
     *
     * `coverBytes`·`mediaBytes`는 데이터 폴더의 실제 폴더 크기다. **스토리지를 쓰는
     * 중이어도 로컬 폴더를 잰다** — 마스터 커버 폴백과 예전에 받아둔 것이 거기 남는다
     */
    public record DatabaseStatus(String product, Long sizeBytes, Long totalBytes,
                                 long coverBytes, long mediaBytes) {}
}
