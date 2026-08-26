package com.milobeene.starlog.common.quota;

/**
 * 관리자 시스템 탭용 — 회원까지 함께 보는 하루치 사용량.
 *
 * `DailyUsage`와 나뉘어 있는 이유는 회원 id 하나뿐이다. 합치면 설정 화면 쪽이
 * 늘 쓰지 않는 값을 들고 다니게 된다.
 *
 * **엔티티가 아니라 값이다** — 이유는 `DailyUsage` 주석 참고.
 */
public record MemberDailyUsage(Long memberId, QuotaKind kind, int used) {
}
