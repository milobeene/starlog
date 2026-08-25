package com.milobeene.starlog.platform.controller;

import com.milobeene.starlog.common.dto.IdResponse;
import com.milobeene.starlog.common.web.LoginMember;
import com.milobeene.starlog.platform.dto.CatalogNameRequest;
import com.milobeene.starlog.platform.service.InputMethodService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

/** 내 입력 방식 (FR-PLT-04). 예전엔 enum 4개라 사용자가 손댈 수 없었다 */
@RestController
@RequestMapping("/api/me/input-methods")
@RequiredArgsConstructor
public class InputMethodController {

    private final InputMethodService inputMethodService;

    @PostMapping
    public ResponseEntity<IdResponse> register(@LoginMember Long memberId,
                                               @Valid @RequestBody CatalogNameRequest request) {
        Long inputMethodId = inputMethodService.register(memberId, request.name());

        return ResponseEntity.created(URI.create("/api/me/input-methods/" + inputMethodId))
                .body(IdResponse.of(inputMethodId));
    }

    @PutMapping("/{inputMethodId}")
    public void rename(@LoginMember Long memberId, @PathVariable Long inputMethodId,
                       @Valid @RequestBody CatalogNameRequest request) {
        inputMethodService.rename(memberId, inputMethodId, request.name());
    }

    @DeleteMapping("/{inputMethodId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long inputMethodId) {
        inputMethodService.delete(memberId, inputMethodId);

        return ResponseEntity.noContent().build();
    }
}
