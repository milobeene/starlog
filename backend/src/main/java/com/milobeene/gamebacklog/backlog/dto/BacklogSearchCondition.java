package com.milobeene.gamebacklog.backlog.dto;

import com.milobeene.gamebacklog.backlog.domain.BacklogStatus;
import com.milobeene.gamebacklog.common.util.TextValues;

import java.util.List;

/**
 * 목록 검색·필터 조건 (FR-QRY-02, FR-QRY-03).
 *
 * 전부 선택이고 null·빈 값은 "조건 없음"이다. 조건을 하나로 묶는 이유 —
 * 리포지토리 시그니처가 파라미터 여러 개로 늘어나면 같은 타입이 나란히 붙어
 * 순서를 바꿔도 컴파일이 통과한다 (Command record를 도입한 것과 같은 이유).
 *
 * deviceId는 **회차**의 기기, platformAccountId·platformId는 **취득** 기준이다.
 * facets가 계정 카운트를 취득 기준으로 세고 있어서 필터도 같은 뜻으로 맞췄다 (API 설계서 §1.2)
 *
 * **genreName이 genreId와 따로 있는 이유** (Phase 8) — 개인 장르는 마스터를 *덮어쓰는*
 * 값이다(§6.7). id로 거르면 개인 장르가 없는 항목의 마스터 장르가 필터에 안 걸린다.
 * 이름으로 걸어야 화면에 보이는 값(resolved)과 필터 결과가 일치한다
 */
public record BacklogSearchCondition(
        String keyword,
        List<BacklogStatus> statuses,
        Long tagId,
        Long genreId,
        String genreName,
        String developer,
        Integer releaseYear,
        Long deviceId,
        Long platformId,
        Long platformAccountId
) {

    public BacklogSearchCondition {
        keyword = TextValues.normalize(keyword);
        genreName = TextValues.normalize(genreName);
        developer = TextValues.normalize(developer);
        statuses = statuses == null ? List.of() : List.copyOf(statuses);
    }

    public static BacklogSearchCondition empty() {
        return new BacklogSearchCondition(null, null, null, null, null, null, null, null, null, null);
    }

    public boolean hasKeyword() {
        return keyword != null;
    }

    public boolean hasStatuses() {
        return !statuses.isEmpty();
    }
}
