package com.milobeene.gamebacklog.platform.controller;

import com.milobeene.gamebacklog.common.dto.IdResponse;
import com.milobeene.gamebacklog.common.web.LoginMember;
import com.milobeene.gamebacklog.platform.dto.EmulatorRequest;
import com.milobeene.gamebacklog.platform.service.EmulatorService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

/** 내 에뮬레이터 (FR-PLT-04) */
@RestController
@RequestMapping("/api/me/emulators")
@RequiredArgsConstructor
public class EmulatorController {

    private final EmulatorService emulatorService;

    @PostMapping
    public ResponseEntity<IdResponse> register(@LoginMember Long memberId,
                                               @Valid @RequestBody EmulatorRequest request) {
        Long emulatorId = emulatorService.register(memberId, request.name(), request.memo());

        return ResponseEntity.created(URI.create("/api/me/emulators/" + emulatorId))
                .body(IdResponse.of(emulatorId));
    }

    @PutMapping("/{emulatorId}")
    public void update(@LoginMember Long memberId, @PathVariable Long emulatorId,
                       @Valid @RequestBody EmulatorRequest request) {
        emulatorService.update(memberId, emulatorId, request.name(), request.memo());
    }

    @DeleteMapping("/{emulatorId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long emulatorId) {
        emulatorService.delete(memberId, emulatorId);

        return ResponseEntity.noContent().build();
    }
}
