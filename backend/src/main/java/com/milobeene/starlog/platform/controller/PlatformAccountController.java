package com.milobeene.starlog.platform.controller;

import com.milobeene.starlog.common.dto.IdResponse;
import com.milobeene.starlog.common.web.LoginMember;
import com.milobeene.starlog.platform.dto.PlatformAccountCreateRequest;
import com.milobeene.starlog.platform.dto.PlatformAccountRenameRequest;
import com.milobeene.starlog.platform.service.PlatformAccountService;
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
 * 플랫폼 계정 (FR-PLT-01, 02).
 *
 * 소프트 삭제 + 되살리기가 있는 두 번째 리소스다 — 회차·취득이 참조하므로 지우면 안 된다 (§6.5).
 * 되살리기 흐름은 백로그 항목과 완전히 같다: 재등록 시 409 + reviveUrl
 */
@RestController
@RequestMapping("/api/me/platform-accounts")
@RequiredArgsConstructor
public class PlatformAccountController {

    private final PlatformAccountService platformAccountService;

    @PostMapping
    public ResponseEntity<IdResponse> register(@LoginMember Long memberId,
                                               @Valid @RequestBody PlatformAccountCreateRequest request) {
        Long accountId = platformAccountService.register(
                memberId, request.platformId(), request.accountLabel());

        return ResponseEntity.created(URI.create("/api/me/platform-accounts/" + accountId))
                .body(IdResponse.of(accountId));
    }

    @PutMapping("/{accountId}")
    public void rename(@LoginMember Long memberId, @PathVariable Long accountId,
                       @Valid @RequestBody PlatformAccountRenameRequest request) {
        platformAccountService.rename(memberId, accountId, request.accountLabel());
    }

    /** 소프트 삭제. 과거 기록에서는 계정 이름이 계속 보이고, 선택지에서만 빠진다 */
    @DeleteMapping("/{accountId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long accountId) {
        platformAccountService.delete(memberId, accountId);

        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{accountId}/revive")
    public void revive(@LoginMember Long memberId, @PathVariable Long accountId) {
        platformAccountService.revive(memberId, accountId);
    }
}
