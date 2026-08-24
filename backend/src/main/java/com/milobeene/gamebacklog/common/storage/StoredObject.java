package com.milobeene.gamebacklog.common.storage;

/**
 * 스토리지에 실제로 올라간 객체의 메타데이터 (K-3).
 *
 * 클라이언트가 "선언한" 값이 아니라 **스토리지가 본 실제 값**이다.
 * presigned 방식에서는 서버가 파일을 안 거치므로, 확정 단계에서 이걸로 재검증한다
 */
public record StoredObject(
        String contentType,
        long sizeBytes
) {
}
