package com.milobeene.gamebacklog.tag.controller;

import com.milobeene.gamebacklog.common.web.LoginMember;
import com.milobeene.gamebacklog.tag.dto.NameRequest;
import com.milobeene.gamebacklog.tag.service.TagService;
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
