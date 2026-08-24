package com.milobeene.gamebacklog.common.storage;

import com.milobeene.gamebacklog.common.exception.ExternalApiException;

import java.time.Duration;
import java.util.Optional;

/**
 * 자격증명이 없을 때 자리를 지키는 구현 (K-2).
 *
 * 빈을 아예 안 만들면 이걸 주입받는 서비스가 없어서 앱이 기동에 실패한다.
 * 자격증명 없이도 앱 전체가 떠야 로컬·CI가 돌아가므로, 기동은 시키고
 * **실제로 부르는 순간에만** 502로 끊는다. IgdbTokenProvider와 같은 태도다.
 *
 * 조용히 성공한 척하지 않는 게 핵심이다 — 그러면 업로드가 되는 줄 알고 넘어간다
 */
public class UnconfiguredFileStorage implements FileStoragePort {

    private static final String MESSAGE =
            "스토리지 설정이 없습니다 (app.storage.endpoint / bucket / access-key / secret-key)";

    @Override
    public PresignedUpload presignUpload(String storageKey, String contentType, long sizeBytes,
                                         Duration expiresIn) {
        throw new ExternalApiException(ExternalApiException.Service.FILE_STORAGE, MESSAGE);
    }

    @Override
    public Optional<StoredObject> head(String storageKey) {
        throw new ExternalApiException(ExternalApiException.Service.FILE_STORAGE, MESSAGE);
    }

    @Override
    public byte[] readHead(String storageKey, int length) {
        throw new ExternalApiException(ExternalApiException.Service.FILE_STORAGE, MESSAGE);
    }

    @Override
    public void delete(String storageKey) {
        // 삭제는 조용히 넘어간다 — DB 커밋 뒤에 불리므로 여기서 터지면 성공한 삭제가 실패로 보인다
    }

    @Override
    public String publicUrl(String storageKey) {
        return null;
    }
}
