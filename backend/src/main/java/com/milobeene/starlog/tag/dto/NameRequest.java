package com.milobeene.starlog.tag.dto;

/** 태그·장르 이름 변경 (FR-TAG-02). 같은 이름이 이미 있으면 409 — 병합하지 않는다 */
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NameRequest(@NotBlank @Size(max = 50) String name) {
}
