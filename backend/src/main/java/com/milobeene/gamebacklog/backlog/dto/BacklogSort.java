package com.milobeene.gamebacklog.backlog.dto;

import com.milobeene.gamebacklog.backlog.domain.QBacklogEntry;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.querydsl.core.types.OrderSpecifier;
import com.querydsl.core.types.dsl.ComparableExpressionBase;
import org.springframework.data.domain.Sort;

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

    LAST_PLAYED("lastPlayed", Sort.Order.desc("lastPlayedOn").nullsLast(),
            entry -> entry.lastPlayedOn.desc().nullsLast()),
    RATING("rating", Sort.Order.desc("rating").nullsLast(),
            entry -> entry.rating.desc().nullsLast()),
    RELEASED_ON("releasedOn", Sort.Order.desc("releasedOnResolved").nullsLast(),
            entry -> entry.releasedOnResolved.desc().nullsLast()),
    NAME("name", Sort.Order.asc("displayName"),
            entry -> entry.displayName.asc()),

    /** 대시보드의 "최다 플레이" 타일용 (v1.7). 기록이 없으면 뒤로 민다 */
    PLAYTIME("playtime", Sort.Order.desc("playTimeHours").nullsLast(),
            entry -> entry.playTimeHours.desc().nullsLast());

    /** 동점 시 2차 기준은 항상 최근 플레이순 (BR-QRY-01) */
    private static final Sort.Order SECONDARY = Sort.Order.desc("lastPlayedOn").nullsLast();

    /**
     * 마지막 tie-break. BR-QRY-01만으로는 부족하다 —
     * 회차가 없는 항목끼리는 lastPlayedOn이 둘 다 null이라 순서가 매 요청 흔들리고,
     * 그러면 페이징에서 같은 행이 두 번 나오거나 아예 빠진다
     */
    private static final Sort.Order TIE_BREAK = Sort.Order.desc("id");

    private final String param;
    private final Sort.Order primary;
    private final Function<QBacklogEntry, OrderSpecifier<?>> primaryOrder;

    BacklogSort(String param, Sort.Order primary,
                Function<QBacklogEntry, OrderSpecifier<?>> primaryOrder) {
        this.param = param;
        this.primary = primary;
        this.primaryOrder = primaryOrder;
    }

    /**
     * nullsLast를 붙이는 이유 — 회차가 없으면 lastPlayedOn이, 평가 전이면 rating이 null이다.
     * NULL을 어디 놓을지는 DB마다 다르다(H2는 가장 작게, PostgreSQL은 가장 크게).
     * 그냥 두면 dev와 prod의 정렬 결과가 갈린다.
     *
     * p6spy 로그에 nulls last가 안 보여도 정상이다 — 방언 기본값과 같으면
     * Hibernate가 중복 절을 생략한다. H2에서 desc nulls last가 그런 경우다
     */
    public Sort toSort() {
        if (this == LAST_PLAYED) {
            return Sort.by(primary, TIE_BREAK);   // 1차와 2차가 같은 컬럼이라 중복을 뺀다
        }
        return Sort.by(primary, SECONDARY, TIE_BREAK);
    }

    /**
     * QueryDSL용 정렬 (L-1).
     *
     * Spring의 Sort를 QueryDSL이 그대로 못 받아서 같은 규칙을 한 번 더 표현한다.
     * **두 표현이 갈라지면 정렬이 조용히 달라지므로** 같은 enum 안에 나란히 둔다 —
     * 한쪽만 고치면 다른 쪽이 바로 눈에 띈다.
     *
     * LinkedHashSet으로 중복을 거르는 이유 — LAST_PLAYED는 1차와 2차가 같은 컬럼이다.
     * 같은 컬럼을 order by에 두 번 쓰면 뒤엣것이 무시될 뿐이지만 SQL이 지저분해진다
     */
    public OrderSpecifier<?>[] toOrderSpecifiers(QBacklogEntry entry) {
        Set<OrderSpecifier<?>> orders = new LinkedHashSet<>();
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
