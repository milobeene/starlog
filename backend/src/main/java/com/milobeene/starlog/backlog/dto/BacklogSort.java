package com.milobeene.starlog.backlog.dto;

import com.milobeene.starlog.backlog.domain.BacklogStatus;
import com.milobeene.starlog.backlog.domain.QBacklogEntry;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.querydsl.core.types.OrderSpecifier;
import com.querydsl.core.types.dsl.CaseBuilder;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.function.Function;

/**
 * 목록 정렬 4종 (FR-QRY-04). 정렬 컬럼명이 컨트롤러·리포지토리로 새지 않게 여기 가둔다.
 *
 * 정렬 대상이 전부 비정규화 컬럼인 이유 (§6.8) — 오버라이드와 마스터를 매번 합성하면
 * COALESCE 조인이 되어 인덱스를 못 탄다
 */
public enum BacklogSort {

    /**
     * 최근 플레이순. **진행 중인 게임이 무조건 맨 앞이다.**
     *
     * 날짜만으로 세우면 어제 끝낸 게임이 지난달에 시작해 아직 붙들고 있는 게임보다 위로 온다.
     * 그런데 "지금 뭘 하고 있나"가 이 목록을 여는 이유라 그게 뒤로 밀리면 안 된다.
     *
     * 진행 중인 것끼리는 lastPlayedOn 내림차순이 그대로 맞다 —
     * 종료일이 없는 회차는 lastActivityOn이 시작일이라(Playthrough.lastActivityOn),
     * **늦게 시작한 것이 위**로 온다
     */
    LAST_PLAYED("lastPlayed",
            entry -> entry.lastPlayedOn.desc().nullsLast()),
    RATING("rating",
            entry -> entry.rating.desc().nullsLast()),
    RELEASED_ON("releasedOn",
            entry -> entry.releasedOnResolved.desc().nullsLast()),
    NAME("name",
            entry -> entry.displayName.asc()),

    /** 대시보드의 "최다 플레이" 타일용 (v1.7). 기록이 없으면 뒤로 민다 */
    PLAYTIME("playtime",
            entry -> entry.playTimeHours.desc().nullsLast());

    private final String param;
    private final Function<QBacklogEntry, OrderSpecifier<?>> primaryOrder;

    BacklogSort(String param, Function<QBacklogEntry, OrderSpecifier<?>> primaryOrder) {
        this.param = param;
        this.primaryOrder = primaryOrder;
    }

    /**
     * QueryDSL용 정렬 (L-1).
     *
     * **표현은 이것 하나뿐이다.** 예전엔 Spring `Sort` 버전을 나란히 두고 둘이 어긋나지
     * 않는지 테스트로 지켰는데, "진행 중을 맨 앞으로"가 들어오면서 `Sort`로는 그 규칙을
     * 아예 못 쓰게 됐다(CASE식은 프로퍼티 이름이 아니다). 실제 규칙을 표현하지 못하는
     * 두 번째 표현은 안전망이 아니라 거짓말이라 걷어냈다 — 쓰는 곳도 없었다.
     *
     * LinkedHashSet으로 중복을 거르는 이유 — LAST_PLAYED는 1차와 2차가 같은 컬럼이다.
     * 같은 컬럼을 order by에 두 번 쓰면 뒤엣것이 무시될 뿐이지만 SQL이 지저분해진다
     */
    public OrderSpecifier<?>[] toOrderSpecifiers(QBacklogEntry entry) {
        Set<OrderSpecifier<?>> orders = new LinkedHashSet<>();

        /*
         * 최근 플레이순에서만 진행 중을 맨 앞으로 끌어올린다.
         *
         * CASE로 0/1을 만들어 desc로 세운다 — enum을 그냥 정렬하면 문자열 순서라
         * PLAYING이 어디 놓일지가 이름 철자에 달린다.
         *
         * 다른 정렬(평점·이름·출시일)에는 안 붙인다. 그쪽은 사용자가 그 기준 하나로
         * 줄을 세워 달라고 명시적으로 고른 것이라 상태가 끼어들면 기준이 흐려진다
         */
        if (this == LAST_PLAYED) {
            orders.add(new CaseBuilder()
                    .when(entry.status.eq(BacklogStatus.PLAYING)).then(1)
                    .otherwise(0)
                    .desc());
        }

        orders.add(primaryOrder.apply(entry));
        orders.add(entry.lastPlayedOn.desc().nullsLast());   // BR-QRY-01
        orders.add(entry.id.desc());                          // tie-break
        return orders.toArray(OrderSpecifier<?>[]::new);
    }

    /** 쿼리 파라미터 문자열 → enum. 대소문자·언더스코어를 흡수한다 */
    public static BacklogSort from(String value) {
        if (value == null || value.isBlank()) {
            return LAST_PLAYED;
        }
        String normalized = value.strip().replace("_", "");
        return Arrays.stream(values())
                .filter(sort -> sort.param.equalsIgnoreCase(normalized))
                .findFirst()
                .orElseThrow(() -> new InvalidInputException("지원하지 않는 정렬입니다: " + value));
    }
}
