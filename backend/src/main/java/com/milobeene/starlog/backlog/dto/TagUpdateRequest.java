package com.milobeene.starlog.backlog.dto;

import jakarta.validation.constraints.Size;

/**
 * 항목의 태그 교체 (FR-TAG-01). **항목당 하나다.**
 *
 * name이 null이거나 공백이면 태그를 뗀다 — 사전 행은 지우지 않고 조회에서 거른다 (§6.7).
 * @NotNull을 안 붙인 이유가 그것이다: "없음"이 유효한 값이다
 */
public record TagUpdateRequest(@Size(max = 50) String name) {
}
