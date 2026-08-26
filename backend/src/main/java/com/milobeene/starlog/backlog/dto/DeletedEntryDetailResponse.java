package com.milobeene.starlog.backlog.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 삭제한 항목 미리보기 (§7.4).
 *
 * 상세 DTO(`BacklogDetailResponse`)를 재활용하지 않는다 — 그건 오버라이드·마스터·회차·취득을
 * 전부 실어 편집 화면을 그리기 위한 것이고, 여기서 필요한 건 **"이게 뭐였는지 알아볼 만큼"**이다.
 * 완전 삭제 버튼 옆에 붙는 창이라 정보가 많을수록 판단이 흐려진다.
 *
 * 회차·취득은 개수만 준다. 되살리면 통째로 돌아오므로 목록을 늘어놓을 이유가 없고,
 * "몇 개나 딸려 있었나"가 지울지 말지의 실제 판단 기준이다
 */
public record DeletedEntryDetailResponse(
        Long entryId,
        String displayName,
        LocalDateTime deletedAt,
        LocalDateTime createdAt,
        String coverImageId,
        BigDecimal rating,
        Integer playTimeHours,
        String memo,
        List<String> genres,
        int playthroughCount,
        int acquisitionCount) {
}
