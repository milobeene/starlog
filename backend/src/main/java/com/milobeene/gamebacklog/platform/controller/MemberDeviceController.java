package com.milobeene.gamebacklog.platform.controller;

import com.milobeene.gamebacklog.common.dto.IdResponse;
import com.milobeene.gamebacklog.common.web.LoginMember;
import com.milobeene.gamebacklog.platform.dto.MemberDeviceCreateRequest;
import com.milobeene.gamebacklog.platform.dto.MemberDeviceUpdateRequest;
import com.milobeene.gamebacklog.platform.service.MemberDeviceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

/**
 * 보유 기기 (FR-PLT-03).
 *
 * 물리 삭제인 이유 — 회차가 가리키는 건 기기 "마스터"(Device)지 보유 기록(MemberDevice)이 아니다.
 * 지워도 과거 회차의 기기 이름은 그대로 남는다
 */
@RestController
@RequestMapping("/api/me/devices")
@RequiredArgsConstructor
public class MemberDeviceController {

    private final MemberDeviceService memberDeviceService;

    @PostMapping
    public ResponseEntity<IdResponse> register(@LoginMember Long memberId,
                                               @Valid @RequestBody MemberDeviceCreateRequest request) {
        Long memberDeviceId = memberDeviceService.register(
                memberId, request.deviceId(), request.label(), request.memo());

        return ResponseEntity.created(URI.create("/api/me/devices/" + memberDeviceId))
                .body(IdResponse.of(memberDeviceId));
    }

    @PutMapping("/{memberDeviceId}")
    public void update(@LoginMember Long memberId, @PathVariable Long memberDeviceId,
                       @Valid @RequestBody MemberDeviceUpdateRequest request) {
        memberDeviceService.update(memberId, memberDeviceId, request.label(), request.memo());
    }

    @DeleteMapping("/{memberDeviceId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long memberDeviceId) {
        memberDeviceService.delete(memberId, memberDeviceId);

        return ResponseEntity.noContent().build();
    }
}
