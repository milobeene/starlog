package com.milobeene.gamebacklog.common.storage;

import java.time.Duration;

/**
 * 업로드 허가증 (K-2).
 *
 * 브라우저는 이 URL로 직접 PUT한다. 서버는 파일 바이트를 안 거친다 —
 * 무료 티어 메모리(512MB)와 요청 점유 시간을 지키기 위한 선택이다 (§6.10)
 */
public record PresignedUpload(
        String uploadUrl,
        String storageKey,
        Duration expiresIn
) {
}
