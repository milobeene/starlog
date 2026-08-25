package com.milobeene.gamebacklog.backlog.dto;

import java.util.List;

/**
 * 개발사·유통사 사전 (Phase 8).
 *
 * **두 벌인 이유가 다르다.**
 *   developers/publishers  — 오버라이드 + 마스터를 합친 전부. **필터 자동완성**용이라
 *                            IGDB가 준 이름으로도 걸러야 한다
 *   overridden*            — 내가 직접 적어 넣은 것만. **설정의 사전 목록**용이다.
 *                            마스터 값은 내 어휘가 아니라 사전에 낄 자리가 아니다
 *
 * 둘을 한 응답에 묶은 이유 — 같은 테이블을 훑는 값이고 쓰는 화면이 겹친다
 */
public record CompanyDictionary(
        List<String> developers,
        List<String> publishers,
        List<String> overriddenDevelopers,
        List<String> overriddenPublishers) {
}
