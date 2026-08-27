package com.milobeene.starlog.common.storage;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 데이터 루트 안의 경로들 (v1.0 6·7단계, architecture §5).
 *
 * ## 스프링은 이 경로를 "정하지" 않는다
 *
 * 어디에 둘지는 **일렉트론이 정하고 `STARLOG_DATA_ROOT`로 넘긴다.** 사용자가 외장 디스크로
 * 옮길 수 있어야 하는데 그 설정은 앱데이터의 `settings.json`에 있고, 스프링은 그 파일을 모른다
 * (architecture §7 "스프링은 이 파일을 모른다").
 *
 * **안 넘어오면 개발 환경으로 본다** — `bootRun`으로 띄우는 길이 살아 있어야 하므로
 * 프로젝트 밖 임시 경로로 떨어뜨린다. 그 길에서도 커버 업로드가 되긴 해야 한다
 */
@Slf4j
@Component
public class MediaPaths {

    private final Path root;

    public MediaPaths(@Value("${starlog.data-root:}") String configured) {
        this.root = (configured == null || configured.isBlank())
                ? Paths.get(System.getProperty("java.io.tmpdir"), "starlog-dev-data")
                : Paths.get(configured);
    }

    /**
     * 없으면 만든다.
     *
     * 기동 때 한 번 하는 이유 — 업로드 시점에 만들면 **권한 문제를 파일을 받은 뒤에야 안다.**
     * 사용자가 데이터 루트를 못 쓰는 곳으로 지정했다면 그건 앱을 열자마자 드러나야 한다
     */
    @PostConstruct
    void ensure() throws IOException {
        Files.createDirectories(covers());
        Files.createDirectories(media());
        log.info("데이터 루트: {}", root.toAbsolutePath());
    }

    public Path root() {
        return root;
    }

    /** 개인 업로드 커버 (location = LOCAL) */
    public Path covers() {
        return root.resolve("covers");
    }

    /** 게임별 스크린샷. 그 아래에 slug 폴더가 하나씩 생긴다 */
    public Path media() {
        return root.resolve("media");
    }

    /**
     * 게임 하나의 스크린샷 폴더.
     *
     * ⚠️ **slug를 그대로 이어 붙이면 안 된다.** `..`이나 구분자가 섞이면 데이터 루트 밖으로
     * 나간다. 만드는 쪽(Slugs)이 이미 막지만, **경로를 조립하는 여기서 한 번 더 확인한다** —
     * 검증은 값이 흐르는 길목마다 있어야지 한 곳에만 있으면 우회로가 생긴다
     */
    public Path mediaFolder(String slug) {
        Path folder = media().resolve(slug).normalize();
        if (!folder.startsWith(media())) {
            throw new IllegalArgumentException("잘못된 폴더 이름입니다: " + slug);
        }
        return folder;
    }
}
