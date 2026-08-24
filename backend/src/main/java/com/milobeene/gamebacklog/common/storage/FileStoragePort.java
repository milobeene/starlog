package com.milobeene.gamebacklog.common.storage;

import java.time.Duration;
import java.util.Optional;

/**
 * 오브젝트 스토리지 포트 (K-2).
 *
 * GameCatalogClient와 같은 이유로 인터페이스를 둔다 — 벤더(R2)가 바뀔 수 있고,
 * 테스트가 실제 버킷을 때리면 안 되며, 자격증명 없이도 CI가 돌아야 한다.
 * **이름에 벤더를 넣지 않는다.** IGDB 전환에서 배운 것
 */
public interface FileStoragePort {

    /**
     * 업로드 허가증 발급.
     *
     * contentType·sizeBytes를 인자로 받는 이유가 K-3의 절반이다 —
     * 이 둘을 **서명에 포함**시키면, 클라이언트가 다른 타입·크기로 올릴 때
     * 우리 서버가 아니라 **스토리지가 거부한다**. 앱 검증을 우회할 수 없게 된다
     */
    PresignedUpload presignUpload(String storageKey, String contentType, long sizeBytes,
                                  Duration expiresIn);

    /** 실제로 올라갔는지 + 실제 타입·크기. 확정 단계의 재검증용 */
    Optional<StoredObject> head(String storageKey);

    /**
     * 앞부분 몇 바이트만 읽는다. 매직 넘버 검사용 (K-3).
     * 파일 전체를 받으면 5MB짜리를 서버 메모리에 올리게 된다 — 그러려고 presigned를 쓴 게 아니다
     */
    byte[] readHead(String storageKey, int length);

    /** 실패해도 예외를 던지지 않는다. 고아 파일은 라이프사이클 규칙이 정리한다 (K-4) */
    void delete(String storageKey);

    /** 공개 조회 URL. storageKey만 저장하고 URL은 여기서 조합한다 */
    String publicUrl(String storageKey);
}
