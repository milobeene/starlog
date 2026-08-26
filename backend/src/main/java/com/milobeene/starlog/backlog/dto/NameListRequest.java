package com.milobeene.starlog.backlog.dto;

import java.util.List;

/**
 * 개인 장르 전체 교체 (FR-TAG-05). 태그는 항목당 하나가 되면서 TagUpdateRequest로 갈라졌다.
 * 빈 배열을 보내면 전부 떼어진다 — 사전 행은 지우지 않고 조회에서 거른다 (§6.7)
 */
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record NameListRequest(@NotNull List<@Size(max = 50) String> names) {
}
