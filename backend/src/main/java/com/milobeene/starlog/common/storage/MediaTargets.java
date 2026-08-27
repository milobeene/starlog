package com.milobeene.starlog.common.storage;

import com.milobeene.starlog.backlog.domain.CoverLocation;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * "이건 어디에 저장하지?"를 답하는 한 곳 (v1.0 6·7단계).
 *
 * 설정(체크박스)과 현실(자격증명이 있나)을 **여기서 한 번만 합친다.** 업로드 지점마다
 * `properties.useStorageForCovers() && storage.hasCredentials()`를 쓰면
 * 한 군데를 빠뜨리는 순간 **올릴 데가 없는데 스토리지로 보내는** 경로가 생긴다
 */
@Component
@RequiredArgsConstructor
@EnableConfigurationProperties(MediaTargetProperties.class)
public class MediaTargets {

    private final MediaTargetProperties properties;
    private final StorageProperties storageProperties;

    public CoverLocation forCover() {
        return useStorage(properties.useStorageForCovers())
                ? CoverLocation.EXTERNAL : CoverLocation.LOCAL;
    }

    public boolean screenshotsToStorage() {
        return useStorage(properties.useStorageForScreenshots());
    }

    /** 체크했더라도 자격증명이 없으면 로컬이다. 켜진 채로 실패하게 두지 않는다 */
    private boolean useStorage(boolean requested) {
        return requested && storageProperties.hasCredentials();
    }
}
