package com.milobeene.starlog.common.quota;

import java.util.List;

/**
 * 일일 쿼터 관문.
 *
 * **인터페이스로 둔 이유가 이 프로젝트에서는 특별하다** — 로컬 앱(v1.0)에는 쿼터가 없다.
 * 호출부마다 `if (웹이면)`을 뿌리는 대신 구현을 통째로 갈아끼운다:
 * 웹은 `DbQuotaGuard`, 로컬 앱은 `NoOpQuotaGuard` (docs/web-only-inventory.md §5).
 */
public interface QuotaGuard {

    /**
     * 한 건 쓴다. 한도를 넘었으면 던진다.
     *
     * **먼저 세고 나서 일한다** — 일하고 세면 실패한 호출이 쿼터를 안 먹어서,
     * 실패를 반복하는 클라이언트가 한도를 무한히 우회한다
     */
    void consume(Long memberId, QuotaKind kind);

    /** 설정 화면의 "오늘 검색 12/200". 쿼터가 없는 빌드에서는 빈 목록이다 */
    List<QuotaStatus> statusOf(Long memberId);

    /**
     * `limit`이 **null이면 무제한**이다 (관리자). 0이나 -1 같은 마법값을 안 쓰는 이유 —
     * 화면이 `12 / 200`을 그리다가 `12 / -1`을 만나면 그냥 이상한 숫자가 보인다.
     * null이면 타입이 강제로 분기를 만들게 한다
     */
    record QuotaStatus(QuotaKind kind, String label, int used, Integer limit) {}
}
