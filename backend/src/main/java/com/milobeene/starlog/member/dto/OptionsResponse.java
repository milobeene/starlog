package com.milobeene.starlog.member.dto;

import java.util.List;

/**
 * 편집 폼 선택지 (화면 2·4 공용, API 설계서 §1.5).
 *
 * facets(§1.2)와 다르다 — 여기엔 카운트가 없고, 아직 아무 데도 안 쓴 것까지 전부 들어간다.
 *
 * **전부 내 것만 나온다.** 예전엔 플랫폼·기기·에뮬이 전역 마스터라 남의 것까지 섞여 있었다.
 * 삭제한 항목은 빠지므로, 삭제된 항목이 붙어 있는 과거 기록을 편집할 때는
 * 프론트가 그 항목을 "(삭제됨)"으로 끼워 넣어야 한다 (lib/options.ts의 withCurrent)
 */
public record OptionsResponse(
        List<Ref> platforms,
        List<Ref> devices,            // name은 "거실 스위치 (Nintendo Switch)" 꼴
        List<Ref> emulators,
        List<Ref> inputMethods,
        List<Ref> platformAccounts,
        List<Ref> subscriptions,
        List<String> tagDictionary,
        List<String> genreDictionary
) {

    /** 선택지는 id와 표시 이름만 있으면 된다 */
    public record Ref(Long id, String name) {}
}
