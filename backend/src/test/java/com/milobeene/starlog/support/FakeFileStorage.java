package com.milobeene.starlog.support;

import com.milobeene.starlog.common.storage.FileStoragePort;
import com.milobeene.starlog.common.storage.PresignedUpload;
import com.milobeene.starlog.common.storage.StoredObject;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 스토리지 포트를 가로채는 테스트 구현 (K-2~K-5).
 *
 * 실제 버킷을 때리면 안 되는 이유는 느려서가 아니다 — 자격증명 없는 CI에서 전부 빨개지고,
 * 테스트가 남긴 파일이 쌓인다. 삭제 호출을 기록하는 이유는
 * K-4의 "교체·삭제 시 예전 파일을 지운다"가 곧 호출 여부 검증이기 때문
 */
@TestConfiguration
public class FakeFileStorage implements FileStoragePort {

    /** 스토리지에 실제로 "올라간" 것들 */
    private final Map<String, byte[]> objects = new HashMap<>();
    private final Map<String, String> contentTypes = new HashMap<>();

    public final List<String> deleted = new ArrayList<>();
    public final List<String> presigned = new ArrayList<>();

    /** 장애 주입. 스토리지 실패가 게임 DB 실패와 다르게 안내되는지 보려면 필요하다 */
    private RuntimeException failure;

    /** JPEG 매직 넘버로 시작하는 정상 파일 */
    public static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x11, 0x22, 0x33,
            0x44, 0x55, 0x66, 0x77, (byte) 0x88, (byte) 0x99};
    public static final byte[] PNG = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x11, 0x22, 0x33, 0x44};
    /** 확장자만 이미지인 위장 파일 */
    public static final byte[] HTML = "<html><script>".getBytes();

    public void reset() {
        objects.clear();
        contentTypes.clear();
        deleted.clear();
        presigned.clear();
        failure = null;
    }

    public FakeFileStorage willFail(RuntimeException e) {
        this.failure = e;
        return this;
    }

    /** 브라우저가 업로드를 마친 상태를 흉내낸다 */
    public void putObject(String storageKey, byte[] content, String contentType) {
        objects.put(storageKey, content);
        contentTypes.put(storageKey, contentType);
    }

    public boolean exists(String storageKey) {
        return objects.containsKey(storageKey);
    }

    @Override
    public PresignedUpload presignUpload(String storageKey, String contentType, long sizeBytes,
                                         Duration expiresIn) {
        if (failure != null) {
            throw failure;
        }
        presigned.add(storageKey);
        return new PresignedUpload("https://fake-storage.test/" + storageKey, storageKey, expiresIn);
    }

    @Override
    public Optional<StoredObject> head(String storageKey) {
        byte[] content = objects.get(storageKey);
        if (content == null) {
            return Optional.empty();
        }
        return Optional.of(new StoredObject(contentTypes.get(storageKey), content.length));
    }

    @Override
    public byte[] readHead(String storageKey, int length) {
        byte[] content = objects.getOrDefault(storageKey, new byte[0]);
        int size = Math.min(length, content.length);
        byte[] head = new byte[size];
        System.arraycopy(content, 0, head, 0, size);
        return head;
    }

    @Override
    public void delete(String storageKey) {
        deleted.add(storageKey);
        objects.remove(storageKey);
        contentTypes.remove(storageKey);
    }

    @Override
    public String publicUrl(String storageKey) {
        return "https://cdn.test/" + storageKey;
    }

    @Bean
    @Primary
    FileStoragePort fakeFileStorage() {
        return this;
    }
}
