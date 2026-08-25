package com.milobeene.starlog.platform.controller;

import com.milobeene.starlog.common.dto.IdResponse;
import com.milobeene.starlog.common.web.LoginMember;
import com.milobeene.starlog.platform.dto.CatalogNameRequest;
import com.milobeene.starlog.platform.service.PlatformService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;

/**
 * 내 플랫폼 (FR-PLT-04).
 *
 * 예전엔 `/api/admin/platforms`에 있던 마스터였다. 회원 소유로 내려오면서 관리자 경로는 없앴다 —
 * 남의 플랫폼 이름을 바꿀 수 있는 권한이 애초에 필요 없었다
 */
@RestController
@RequestMapping("/api/me/platforms")
@RequiredArgsConstructor
public class PlatformController {

    private final PlatformService platformService;

    @PostMapping
    public ResponseEntity<IdResponse> register(@LoginMember Long memberId,
                                               @Valid @RequestBody CatalogNameRequest request) {
        Long platformId = platformService.register(memberId, request.name());

        return ResponseEntity.created(URI.create("/api/me/platforms/" + platformId))
                .body(IdResponse.of(platformId));
    }

    @PutMapping("/{platformId}")
    public void rename(@LoginMember Long memberId, @PathVariable Long platformId,
                       @Valid @RequestBody CatalogNameRequest request) {
        platformService.rename(memberId, platformId, request.name());
    }

    /** 소프트 삭제. 이 플랫폼의 계정도 함께 닫힌다 */
    @DeleteMapping("/{platformId}")
    public ResponseEntity<Void> delete(@LoginMember Long memberId, @PathVariable Long platformId) {
        platformService.delete(memberId, platformId);

        return ResponseEntity.noContent().build();
    }
}
