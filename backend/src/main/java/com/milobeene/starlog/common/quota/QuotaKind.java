package com.milobeene.starlog.common.quota;

/**
 * 일일 쿼터의 종류.
 *
 * WEB-ONLY: 한 서버를 여럿이 나눠 쓸 때만 의미가 있다 (docs/web-only-inventory.md).
 *
 * 이름이 곧 DB 값이다 — `chk_usage_quota_kind` 체크 제약과 짝이라 추가할 때 V 마이그레이션도 같이 간다.
 */
public enum QuotaKind {

    /** IGDB 검색. 앱 전체가 초당 4건이라 한 사람이 다 쓰면 나머지가 막힌다 */
    GAME_SEARCH("검색"),

    /** 담기 = IGDB 상세 호출 + 마스터 생성. 검색보다 무겁다 */
    GAME_ADD("담기"),

    /** 커버 업로드. R2는 여유롭지만 한 명이 전부 채우는 걸 막는다 */
    COVER_UPLOAD("커버 업로드");

    private final String label;

    QuotaKind(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
