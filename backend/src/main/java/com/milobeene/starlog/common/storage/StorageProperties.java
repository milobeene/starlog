package com.milobeene.starlog.common.storage;

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
        long maxUploadBytes,
        /**
         * 스크린샷 상한 (v1.0 7단계).
         *
         * **커버와 따로 두는 이유** — 스크린샷은 4K 캡처가 예사라 5MB에서 자주 걸린다.
         * 커버 상한을 같이 올리면 몇 KB짜리 표지에 20MB를 허용하는 셈이라,
         * 실수로 원본 사진을 올렸을 때 걸러주던 그물이 사라진다
         */
        long maxScreenshotBytes,
        /**
         * 영상 상한 (2026-08-28).
         *
         * 스크린샷과 자릿수가 다르다 — 닌텐도 스위치 30초 클립이 20~40MB다.
         * ⚠️ **서블릿의 `spring.servlet.multipart.max-file-size`보다 작아야** 우리 검증이
         * 의미를 갖는다. 크면 톰캣이 먼저 끊어서 우리 메시지가 나갈 기회가 없다
         */
        long maxVideoBytes
) {

    public StorageProperties {
        region = isBlank(region) ? "auto" : region;
        uploadUrlTtl = uploadUrlTtl == null ? Duration.ofMinutes(10) : uploadUrlTtl;
        maxUploadBytes = maxUploadBytes <= 0 ? 5L * 1024 * 1024 : maxUploadBytes;   // 5MB
        maxScreenshotBytes = maxScreenshotBytes <= 0 ? 20L * 1024 * 1024 : maxScreenshotBytes;   // 20MB
        maxVideoBytes = maxVideoBytes <= 0 ? 200L * 1024 * 1024 : maxVideoBytes;   // 200MB
    }

    public boolean hasCredentials() {
        return !isBlank(endpoint) && !isBlank(bucket) && !isBlank(accessKey) && !isBlank(secretKey);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
