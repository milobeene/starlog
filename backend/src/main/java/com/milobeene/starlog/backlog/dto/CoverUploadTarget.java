package com.milobeene.starlog.backlog.dto;

/**
 * "이 커버를 어디에 어떻게 올리면 되나" (v1.0 6단계).
 *
 * 업로드 경로가 둘로 갈리면서(architecture §4) 화면이 먼저 물어보게 됐다.
 * **판정을 서버가 하는 이유** — 자격증명이 있는지, 체크박스가 켜졌는지가 전부 서버에만 있다.
 * 화면이 그걸 알아내려면 설정을 또 내려보내야 하고, 그러면 판정 규칙이 두 곳에 생긴다.
 *
 * `mode`가 `LOCAL`이면 나머지 칸은 전부 null이다 — 올릴 주소가 따로 없고
 * `POST /api/backlog/{entryId}/cover/file`로 파일을 그냥 보내면 된다
 */
public record CoverUploadTarget(String mode,
                                String uploadUrl,
                                String storageKey,
                                String contentType,
                                Long expiresInSeconds) {

    public static CoverUploadTarget local(String contentType) {
        return new CoverUploadTarget("LOCAL", null, null, contentType, null);
    }

    public static CoverUploadTarget external(String uploadUrl, String storageKey,
                                             String contentType, long expiresInSeconds) {
        return new CoverUploadTarget("EXTERNAL", uploadUrl, storageKey, contentType,
                expiresInSeconds);
    }
}
