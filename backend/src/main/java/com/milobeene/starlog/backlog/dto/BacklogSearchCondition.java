package com.milobeene.starlog.backlog.dto;

import com.milobeene.starlog.backlog.domain.AcquisitionMethod;
import com.milobeene.starlog.backlog.domain.BacklogStatus;
import com.milobeene.starlog.common.util.TextValues;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 목록 검색·필터 조건 (FR-QRY-02, FR-QRY-03).
 *
 * ## 축이 셋이다 (v1.1 개편)
 *
 * <pre>
 *   기본   항목 자체의 성질          제목·상태·태그·장르·개발사·출시연도
 *   회차   "언제 무엇으로 했나"      기기·플랫폼|에뮬·계정·기간
 *   취득   "어떻게 손에 넣었나"      방법·가격·플랫폼·계정·기간
 * </pre>
 *
 * 예전에는 셋이 섞여 있었다 — `deviceId`는 회차 기준인데 `platformId`·`platformAccountId`는
 * 취득 기준이라, **같은 이름의 필터가 서로 다른 것을 세고 있었다.** 화면에서는 구별할 방법이
 * 없어서 "스팀으로 걸었는데 스팀에서 한 게임이 안 나온다"가 생겼다.
 *
 * ⚠️ **중첩 레코드로 안 나눴다.** 축은 셋이지만 접두어(`pt`/`acq`)로 갈리고, 중첩하면
 * `empty()`와 모든 호출부가 세 겹으로 깊어진다 — 얻는 것보다 잃는 게 크다.
 *
 * **genreName이 genreId와 따로 있는 이유** (Phase 8) — 개인 장르는 마스터를 *덮어쓰는*
 * 값이다(§6.7). id로 거르면 개인 장르가 없는 항목의 마스터 장르가 필터에 안 걸린다.
 */
public record BacklogSearchCondition(
        String keyword,
        List<BacklogStatus> statuses,
        Long tagId,
        Long genreId,
        String genreName,
        String developer,
        Integer releaseYear,

        /* ── 회차 축 ── */
        Long ptDeviceId,
        Long ptPlatformId,
        Long ptEmulatorId,
        Long ptAccountId,
        LocalDate ptFrom,
        LocalDate ptTo,

        /* ── 취득 축 ── */
        AcquisitionMethod acqMethod,
        String acqCurrency,
        BigDecimal acqMinPrice,
        BigDecimal acqMaxPrice,
        Long acqPlatformId,
        Long acqAccountId,
        LocalDate acqFrom,
        LocalDate acqTo
) {
    public BacklogSearchCondition {
        keyword = TextValues.normalize(keyword);
        genreName = TextValues.normalize(genreName);
        developer = TextValues.normalize(developer);
        acqCurrency = TextValues.normalize(acqCurrency);
        statuses = statuses == null ? List.of() : List.copyOf(statuses);
    }

    public static BacklogSearchCondition empty() {
        return new BacklogSearchCondition(null, null, null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null);
    }

    public boolean hasKeyword() {
        return keyword != null;
    }

    public boolean hasStatuses() {
        return !statuses.isEmpty();
    }

    /** 회차 축에 뭐라도 걸렸나 — 서브쿼리를 만들지 말지 정한다 */
    public boolean hasPlaythroughFilter() {
        return ptDeviceId != null || ptPlatformId != null || ptEmulatorId != null
                || ptAccountId != null || ptFrom != null || ptTo != null;
    }

    /** 취득 축에 뭐라도 걸렸나 */
    public boolean hasAcquisitionFilter() {
        return acqMethod != null || acqMinPrice != null || acqMaxPrice != null
                || acqPlatformId != null || acqAccountId != null
                || acqFrom != null || acqTo != null;
    }
}
