package com.milobeene.starlog.tag.controller;

import java.util.List;
import jakarta.validation.constraints.NotNull;
import com.milobeene.starlog.common.web.LoginMember;
import com.milobeene.starlog.tag.dto.NameRequest;
import com.milobeene.starlog.tag.service.TagService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 태그 사전 관리 (FR-TAG-02). H-4에서 새로 연 경로다 —
 * 서비스에는 있었는데 API 설계서 v0.1에 대응 엔드포인트가 없었다.
 *
 * 태그를 붙이고 떼는 건 백로그 항목 쪽(PUT /api/backlog/{id}/tags)이다.
 * 여기는 사전 자체를 고치는 곳이라 경로가 /api/me 아래다
 */
@RestController
@RequestMapping("/api/me/tags")
@RequiredArgsConstructor
public class TagController {

    private final TagService tagService;

    /**
     * 순서 바꾸기 (v1.1).
     *
     * ⚠️ **`/{tagId}` 앞에 둔다.** 스프링은 더 구체적인 패턴을 먼저 고르지만,
     * `order`가 tagId로 읽히는 실수를 원천에서 막으려면 눈에도 앞에 있어야 한다
     */
    public record ReorderRequest(@NotNull List<Long> tagIds) {}

    @PutMapping("/order")
    public void reorder(@LoginMember Long memberId, @RequestBody @Valid ReorderRequest request) {
        tagService.reorder(memberId, request.tagIds());
    }

    /** 색 바꾸기 (v1.2). 팔레트 이름이거나 null(색 없음) */
    public record ColorRequest(String color) {}

    @PutMapping("/{tagId}/color")
    public void recolor(@LoginMember Long memberId, @PathVariable Long tagId,
                        @RequestBody ColorRequest request) {
        tagService.recolor(memberId, tagId, request.color());
    }

    @PutMapping("/{tagId}")
    public void rename(@LoginMember Long memberId, @PathVariable Long tagId,
                       @Valid @RequestBody NameRequest request) {
        tagService.rename(memberId, tagId, request.name());
    }

    /** 명시적 삭제. 붙어 있던 항목에서도 전부 떨어진다 */
    @DeleteMapping("/{tagId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long tagId) {
        tagService.delete(memberId, tagId);

        return ResponseEntity.noContent().build();
    }
}
