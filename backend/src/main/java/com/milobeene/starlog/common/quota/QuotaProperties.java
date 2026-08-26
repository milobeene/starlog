package com.milobeene.starlog.common.quota;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.EnumMap;
import java.util.Map;

/**
 * 일일 한도. **최대 사용자 10명 기준**으로 잡았다 (docs/capacity-planning.md §2-B).
 *
 * WEB-ONLY (docs/web-only-inventory.md).
 *
 * yml로 뺀 이유 — 지인이 늘거나 줄면 배포 없이 바꿔야 한다.
 * 값이 없으면 아래 기본값이 쓰인다
 */
@ConfigurationProperties(prefix = "app.quota")
public record QuotaProperties(Integer gameSearch, Integer gameAdd, Integer coverUpload,
                              Integer coverUploadMegabytes) {

    private static final int DEFAULT_SEARCH = 200;
    private static final int DEFAULT_ADD = 50;
    private static final int DEFAULT_COVER = 20;
    private static final int DEFAULT_COVER_MB = 200;

    public int limitOf(QuotaKind kind) {
        return switch (kind) {
            case GAME_SEARCH -> gameSearch == null ? DEFAULT_SEARCH : gameSearch;
            case GAME_ADD -> gameAdd == null ? DEFAULT_ADD : gameAdd;
            case COVER_UPLOAD -> coverUpload == null ? DEFAULT_COVER : coverUpload;
        };
    }

    public Map<QuotaKind, Integer> all() {
        Map<QuotaKind, Integer> limits = new EnumMap<>(QuotaKind.class);
        for (QuotaKind kind : QuotaKind.values()) {
            limits.put(kind, limitOf(kind));
        }
        return limits;
    }

    public int coverUploadMegabytesOrDefault() {
        return coverUploadMegabytes == null ? DEFAULT_COVER_MB : coverUploadMegabytes;
    }
}
