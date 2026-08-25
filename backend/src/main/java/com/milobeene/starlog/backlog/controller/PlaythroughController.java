package com.milobeene.starlog.backlog.controller;

import com.milobeene.starlog.backlog.dto.PlaythroughRequest;
import com.milobeene.starlog.backlog.service.PlaythroughService;
import com.milobeene.starlog.common.dto.IdResponse;
import com.milobeene.starlog.common.web.LoginMember;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/**
 * 회차 (FR-PT-01~07).
 *
 * 추가만 부모 경로 아래고 수정·삭제는 아니다 (API 설계서 §2.2) —
 * id가 전역 유니크라 부모를 붙일 이유가 없고, 붙이면 부모와 자식이 안 맞는 경우를
 * 따로 검사해야 한다. 소유권은 어차피 서비스가 BacklogEntryFinder로 확인한다.
 * 그래서 클래스 레벨 @RequestMapping을 두지 않고 경로를 메서드마다 적는다
 */
@RestController
@RequiredArgsConstructor
public class PlaythroughController {

    private final PlaythroughService playthroughService;

    @PostMapping("/api/backlog/{entryId}/playthroughs")
    public ResponseEntity<IdResponse> add(@LoginMember Long memberId,
                                          @PathVariable Long entryId,
                                          @Valid @RequestBody PlaythroughRequest request) {
        Long playthroughId = playthroughService.add(memberId, entryId, request.toCommand());

        return ResponseEntity.created(URI.create("/api/playthroughs/" + playthroughId))
                .body(IdResponse.of(playthroughId));
    }

    /** 전체 교체. 기간이 바뀌면 서비스가 항목 상태를 재계산한다 (§7.6) */
    @PutMapping("/api/playthroughs/{playthroughId}")
    public void update(@LoginMember Long memberId, @PathVariable Long playthroughId,
                       @Valid @RequestBody PlaythroughRequest request) {
        playthroughService.update(memberId, playthroughId, request.toCommand());
    }

    /** 물리 삭제. 회차 번호의 구멍은 메우지 않는다 (B-5 확정) */
    @DeleteMapping("/api/playthroughs/{playthroughId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long playthroughId) {
        playthroughService.delete(memberId, playthroughId);

        return ResponseEntity.noContent().build();
    }
}
