package com.milobeene.gamebacklog.member.dto;

import java.util.List;

/**
 * 편집 폼 선택지 (화면 2·4 공용, API 설계서 §1.5).
 *
 * facets(§1.2)와 다르다 — 여기엔 카운트가 없고, 아직 아무 데도 안 쓴 것까지 전부 들어간다.
 * 기기는 마스터 전체를 준다: 보유 기기 목록은 우선 표시일 뿐 제약이 아니다 (BR-PT-05).
 *
 * 마스터가 늘면 페이징이 필요해진다. 지금은 기기·플랫폼·에뮬이 열 개 남짓이라 전부 준다
 */
public record OptionsResponse(
        List<Ref> platforms,
        List<Ref> devices,
        List<Ref> emulators,
        List<Ref> platformAccounts,   // 삭제된 계정은 빠진다 (§6.5)
        List<Ref> subscriptions,
        List<String> tagDictionary,
        List<String> genreDictionary
) {

    /** 선택지는 id와 표시 이름만 있으면 된다 */
    public record Ref(Long id, String name) {}
}
