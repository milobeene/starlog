package com.milobeene.starlog.platform.controller;

import com.milobeene.starlog.common.dto.IdResponse;
import com.milobeene.starlog.common.web.LoginMember;
import com.milobeene.starlog.platform.dto.DeviceRequest;
import com.milobeene.starlog.platform.service.DeviceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

/**
 * 내 기기 (FR-PLT-03).
 *
 * 소프트 삭제인 이유 — 회차가 이 기기를 직접 가리킨다. 예전엔 회차가 기기 "마스터"를 봤고
 * 보유 기기는 따로 놀아서 물리 삭제해도 됐지만, 이제는 지우면 과거 회차의 기기가 사라진다
 */
@RestController
@RequestMapping("/api/me/devices")
@RequiredArgsConstructor
public class DeviceController {

    private final DeviceService deviceService;

    @PostMapping
    public ResponseEntity<IdResponse> register(@LoginMember Long memberId,
                                               @Valid @RequestBody DeviceRequest request) {
        Long deviceId = deviceService.register(
                memberId, request.deviceType(), request.label(), request.memo());

        return ResponseEntity.created(URI.create("/api/me/devices/" + deviceId))
                .body(IdResponse.of(deviceId));
    }

    @PutMapping("/{deviceId}")
    public void update(@LoginMember Long memberId, @PathVariable Long deviceId,
                       @Valid @RequestBody DeviceRequest request) {
        deviceService.update(memberId, deviceId,
                request.deviceType(), request.label(), request.memo());
    }

    @DeleteMapping("/{deviceId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long deviceId) {
        deviceService.delete(memberId, deviceId);

        return ResponseEntity.noContent().build();
    }
}
