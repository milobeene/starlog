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
        List<AccountRef> platformAccounts,
        List<Ref> subscriptions,
        List<String> tagDictionary,
        List<String> genreDictionary
) {

    /** 선택지는 id와 표시 이름만 있으면 된다 */
    public record Ref(Long id, String name) {}

    /**
     * 계정만 소속 플랫폼을 함께 준다.
     *
     * **왜 계정만 다른가** — 계정 라벨은 회원이 정하는 자유 문자열이라 "Beene"처럼
     * 플랫폼마다 같은 이름이 흔하다. 라벨만 내려주면 선택지에 똑같은 항목이 여러 개 뜨고
     * 어느 것이 스팀인지 알 수 없다. 나머지 다섯 종은 이름만으로 구별되므로 Ref를 그대로 쓴다.
     *
     * Ref에 nullable 필드를 붙이지 않은 이유 — 기기·에뮬·구독에 의미 없는 null이 따라다닌다
     */
    public record AccountRef(Long id, String name, Long platformId, String platformName) {}
}
