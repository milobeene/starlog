package com.milobeene.starlog.admin.dto;

import java.util.List;

/**
 * /admin 시스템 탭 (docs/capacity-planning.md §3).
 *
 * WEB-ONLY (docs/web-only-inventory.md).
 *
 * **외부 모니터링 도구를 쓰지 않는다.** 무료 티어에서 의존을 하나 더 얹는 대가가
 * 이 규모에서 얻는 것보다 크다 — 필요한 값은 전부 DB와 인메모리 카운터로 나온다.
 *
 * null이 뜻이 있는 필드가 둘이다:
 *   - `igdb`: 카탈로그 구현이 HTTP 클라이언트가 아닐 때(테스트 스텁) null
 *   - `database.sizeBytes`: pg_database_size()가 없는 H2에서 null
 */
public record SystemStatusResponse(Igdb igdb, Storage storage, Database database,
                                   List<QuotaRow> quotaToday) {

    /** 프로세스가 뜬 뒤의 누적이다 — Render 무료는 15분 무활동에 내려가므로 자주 0으로 돌아간다 */
    public record Igdb(long calls, long rejected, int maxConcurrent, long minCallIntervalMillis) {}

    public record Storage(long coverCount, long totalBytes) {}

    public record Database(String product, Long sizeBytes) {}

    /** 오늘 누가 무엇을 얼마나 썼나. `limit`이 null이면 무제한(관리자)이다 */
    public record QuotaRow(Long memberId, String nickname, String kind, String label,
                           int used, Integer limit) {}
}
