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
        int retentionDays
) {

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
