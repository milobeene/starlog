package com.milobeene.gamebacklog.common.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * 오브젝트 스토리지 설정 (K-2).
 *
 * R2는 S3 호환이라 endpoint만 갈아끼우면 S3·MinIO로 옮겨간다.
 * region이 R2에서 의미가 없어도 SDK가 요구하므로 `auto`를 기본값으로 둔다
 */
@ConfigurationProperties(prefix = "app.storage")
public record StorageProperties(
        String endpoint,
        String region,
        String bucket,
        String accessKey,
        String secretKey,
        /** 커버를 읽어갈 공개 도메인. R2는 버킷 공개 설정이나 커스텀 도메인이 따로 있다 */
        String publicBaseUrl,
        Duration uploadUrlTtl,
        /** 업로드 상한. 커버 한 장에 이보다 크면 발급 단계에서 거부한다 */
        long maxUploadBytes
) {

    public StorageProperties {
        region = isBlank(region) ? "auto" : region;
        uploadUrlTtl = uploadUrlTtl == null ? Duration.ofMinutes(10) : uploadUrlTtl;
        maxUploadBytes = maxUploadBytes <= 0 ? 5L * 1024 * 1024 : maxUploadBytes;   // 5MB
    }

    public boolean hasCredentials() {
        return !isBlank(endpoint) && !isBlank(bucket) && !isBlank(accessKey) && !isBlank(secretKey);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
