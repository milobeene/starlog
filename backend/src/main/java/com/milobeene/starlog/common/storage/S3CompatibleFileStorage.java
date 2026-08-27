package com.milobeene.starlog.common.storage;

import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import com.milobeene.starlog.common.exception.ExternalApiException;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

import java.io.IOException;
import java.time.Duration;
import java.util.Optional;

/**
 * S3 호환 스토리지 구현 (K-2). Cloudflare R2가 기본 대상이고,
 * endpoint만 바꾸면 AWS S3·MinIO에서도 그대로 돈다.
 *
 * 벤더 이름을 클래스명에 안 넣은 이유 — 실제로 프로토콜이 S3고 R2는 그 구현 중 하나다.
 * `R2FileStorage`로 두면 MinIO로 로컬 검증할 때 이름이 거짓말이 된다
 */
@Slf4j
public class S3CompatibleFileStorage implements FileStoragePort {

    private final S3Client client;
    private final S3Presigner presigner;
    private final StorageProperties properties;

    public S3CompatibleFileStorage(S3Client client, S3Presigner presigner,
                                   StorageProperties properties) {
        this.client = client;
        this.presigner = presigner;
        this.properties = properties;
    }

    @Override
    public PresignedUpload presignUpload(String storageKey, String contentType, long sizeBytes,
                                         Duration expiresIn) {
        /*
         * contentType·contentLength를 PutObjectRequest에 넣으면 **서명 대상에 포함된다.**
         * 브라우저가 다른 Content-Type이나 다른 크기로 PUT하면 서명이 안 맞아 스토리지가 403을 준다.
         * 우리 서버를 거치지 않는 업로드를 통제하는 유일한 수단이다 (K-3)
         */
        PutObjectRequest put = PutObjectRequest.builder()
                .bucket(properties.bucket())
                .key(storageKey)
                .contentType(contentType)
                .contentLength(sizeBytes)
                .build();

        try {
            String url = presigner.presignPutObject(PutObjectPresignRequest.builder()
                            .signatureDuration(expiresIn)
                            .putObjectRequest(put)
                            .build())
                    .url()
                    .toString();

            return new PresignedUpload(url, storageKey, expiresIn);

        } catch (S3Exception e) {
            log.error("presigned URL 발급 실패 — key={}", storageKey, e);
            throw new ExternalApiException(ExternalApiException.Service.FILE_STORAGE, "업로드 주소를 발급하지 못했습니다", e);
        }
    }

    @Override
    public Optional<StoredObject> head(String storageKey) {
        try {
            HeadObjectResponse response = client.headObject(HeadObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(storageKey)
                    .build());

            return Optional.of(new StoredObject(response.contentType(), response.contentLength()));

        } catch (NoSuchKeyException e) {
            // 업로드가 실제로 일어나지 않았다. 장애가 아니라 정상 분기다
            return Optional.empty();

        } catch (S3Exception e) {
            log.error("스토리지 조회 실패 — key={}", storageKey, e);
            throw new ExternalApiException(ExternalApiException.Service.FILE_STORAGE, "업로드된 파일을 확인하지 못했습니다", e);
        }
    }

    @Override
    public byte[] readHead(String storageKey, int length) {
        // Range 헤더로 앞부분만 받는다. 5MB 파일을 통째로 메모리에 올리지 않기 위해서다
        GetObjectRequest request = GetObjectRequest.builder()
                .bucket(properties.bucket())
                .key(storageKey)
                .range("bytes=0-" + (length - 1))
                .build();

        try (ResponseInputStream<?> stream = client.getObject(request)) {
            return stream.readNBytes(length);

        } catch (NoSuchKeyException e) {
            return new byte[0];

        } catch (S3Exception | IOException e) {
            log.error("스토리지 부분 읽기 실패 — key={}", storageKey, e);
            throw new ExternalApiException(ExternalApiException.Service.FILE_STORAGE, "업로드된 파일을 확인하지 못했습니다", e);
        }
    }

    @Override
    public void delete(String storageKey) {
        try {
            client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(storageKey)
                    .build());

        } catch (SdkException e) {
            /*
             * 던지지 않는다. 이 메서드는 DB 커밋 **뒤에** 불린다 (K-4) —
             * 여기서 예외를 올리면 이미 커밋된 삭제가 실패한 것처럼 보인다.
             * 남은 파일은 버킷 라이프사이클 규칙이 정리한다.
             *
             * **S3Exception이 아니라 SdkException을 잡는다.** 네트워크 오류(SdkClientException)는
             * S3Exception의 하위가 아니라, 좁게 잡으면 연결 실패가 그대로 전파돼
             * "절대 안 던진다"는 이 계약이 깨진다. 탈퇴 배치가 그 예외로 통째로 멈추던 경로다
             */
            log.warn("스토리지 파일 삭제 실패 — key={} (고아 파일로 남는다)", storageKey, e);
        }
    }

    @Override
    public String publicUrl(String storageKey) {
        String base = properties.publicBaseUrl();
        if (base == null || base.isBlank()) {
            return null;
        }
        return base.endsWith("/") ? base + storageKey : base + "/" + storageKey;
    }

    /**
     * 버킷에 실제로 닿아본다.
     *
     * `headBucket`을 쓰는 이유 — 목록을 받으면 오브젝트가 수천 개일 때 값이 크고,
     * 넣어보면 쓰레기가 남는다. **존재와 권한만 확인하는 가장 싼 호출**이다.
     *
     * 예외를 종류별로 갈라야 화면이 쓸모 있는 문장을 만든다 —
     * "실패했습니다"로는 키가 틀린 건지 버킷 이름이 틀린 건지 알 수가 없다
     */
    @Override
    public Optional<String> checkAccess() {
        try {
            client.headBucket(b -> b.bucket(properties.bucket()));
            return Optional.empty();
        } catch (NoSuchBucketException e) {
            return Optional.of("버킷을 찾을 수 없습니다: " + properties.bucket());
        } catch (S3Exception e) {
            int status = e.statusCode();
            if (status == 401 || status == 403) {
                return Optional.of("액세스 키 또는 시크릿 키가 거부되었습니다");
            }
            if (status == 404) {
                return Optional.of("버킷을 찾을 수 없습니다: " + properties.bucket());
            }
            return Optional.of("스토리지가 " + status + "로 응답했습니다");
        } catch (SdkException e) {
            // 엔드포인트 오타·인터넷 없음이 여기로 온다
            return Optional.of("스토리지에 연결하지 못했습니다");
        }
    }

}
