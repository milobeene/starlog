package com.milobeene.starlog.backlog.dto;

/**
 * 업로드 허가증 (K-2).
 *
 * 프론트는 uploadUrl로 PUT한 뒤 storageKey를 확정 API에 되돌려준다.
 * **contentType을 같이 내려주는 이유** — 이 값 그대로 PUT의 Content-Type 헤더에 써야 한다.
 * 서명에 포함된 값이라 다르면 스토리지가 403을 준다
 */
public record CoverUploadUrlResponse(
        String uploadUrl,
        String storageKey,
        String contentType,
        long expiresInSeconds) {
}
