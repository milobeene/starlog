package com.milobeene.starlog.backlog.dto;

import java.time.LocalDateTime;

/**
 * 삭제한 게임 한 줄 (§7.4).
 *
 * 카드 DTO를 안 쓰는 이유 — 이 목록에 필요한 건 "무엇을, 언제 지웠나"뿐이다.
 * 커버·회차·기기를 끌고 오면 조회 세 방이 붙는데 되살리기 화면엔 쓸 데가 없다.
 *
 * **만료 시각이 없다.** 삭제한 항목은 기한 없이 남는다 — 지우는 배치가 없다.
 * 30일은 게임이 아니라 **회원 탈퇴 유예**(FR-AUTH-09)의 기간이라 여기와 무관하다
 */
public record DeletedEntryResponse(Long entryId, String displayName, LocalDateTime deletedAt) {
}
