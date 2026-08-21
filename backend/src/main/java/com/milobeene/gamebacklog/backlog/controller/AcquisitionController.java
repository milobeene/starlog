package com.milobeene.gamebacklog.backlog.controller;

import com.milobeene.gamebacklog.backlog.dto.AcquisitionRequest;
import com.milobeene.gamebacklog.backlog.service.AcquisitionService;
import com.milobeene.gamebacklog.common.dto.IdResponse;
import com.milobeene.gamebacklog.common.web.LoginMember;
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

/** 취득 (FR-ACQ-01~06). 경로 구성은 회차와 같다 */
@RestController
@RequiredArgsConstructor
public class AcquisitionController {

    private final AcquisitionService acquisitionService;

    @PostMapping("/api/backlog/{entryId}/acquisitions")
    public ResponseEntity<IdResponse> add(@LoginMember Long memberId,
                                          @PathVariable Long entryId,
                                          @Valid @RequestBody AcquisitionRequest request) {
        Long acquisitionId = acquisitionService.add(memberId, entryId, request.toCommand());

        return ResponseEntity.created(URI.create("/api/acquisitions/" + acquisitionId))
                .body(IdResponse.of(acquisitionId));
    }

    /** 전체 교체. NOT_OWNED ↔ 그 외로 바뀌면 항목 상태가 따라 움직인다 (§7.6) */
    @PutMapping("/api/acquisitions/{acquisitionId}")
    public void update(@LoginMember Long memberId, @PathVariable Long acquisitionId,
                       @Valid @RequestBody AcquisitionRequest request) {
        acquisitionService.update(memberId, acquisitionId, request.toCommand());
    }

    @DeleteMapping("/api/acquisitions/{acquisitionId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long acquisitionId) {
        acquisitionService.delete(memberId, acquisitionId);

        return ResponseEntity.noContent().build();
    }
}
