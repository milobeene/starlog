package com.milobeene.gamebacklog.common.storage;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.net.URI;

/**
 * 스토리지 빈 조립 (K-2).
 *
 * 자격증명이 없으면 UnconfiguredFileStorage로 대체한다 — 기동은 되고 호출만 실패한다.
 * @ConditionalOnProperty 대신 코드 분기를 쓴 이유는 "왜 대체됐는지"를 로그로 남기기 위해서다
 */
@Slf4j
@Configuration
@EnableConfigurationProperties(StorageProperties.class)
public class StorageConfig {

    @Bean
    public FileStoragePort fileStoragePort(StorageProperties properties) {
        if (!properties.hasCredentials()) {
            log.warn("스토리지 자격증명이 없습니다. 커버 업로드가 502로 실패합니다 (app.storage.*)");
            return new UnconfiguredFileStorage();
        }

        StaticCredentialsProvider credentials = StaticCredentialsProvider.create(
                AwsBasicCredentials.create(properties.accessKey(), properties.secretKey()));

        /*
         * pathStyleAccessEnabled — R2와 MinIO는 `endpoint/bucket/key` 형태를 쓴다.
         * 기본값(virtual host, `bucket.endpoint/key`)으로 두면 R2에서 서명이 어긋난다
         */
        S3Configuration s3Config = S3Configuration.builder()
                .pathStyleAccessEnabled(true)
                .build();

        S3Client client = S3Client.builder()
                .endpointOverride(URI.create(properties.endpoint()))
                .region(Region.of(properties.region()))
                .credentialsProvider(credentials)
                .serviceConfiguration(s3Config)
                .build();

        S3Presigner presigner = S3Presigner.builder()
                .endpointOverride(URI.create(properties.endpoint()))
                .region(Region.of(properties.region()))
                .credentialsProvider(credentials)
                .serviceConfiguration(s3Config)
                .build();

        return new S3CompatibleFileStorage(client, presigner, properties);
    }
}
