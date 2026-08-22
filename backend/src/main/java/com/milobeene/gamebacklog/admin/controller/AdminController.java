package com.milobeene.gamebacklog.admin.controller;

import com.milobeene.gamebacklog.admin.dto.AdminMemberResponse;
import com.milobeene.gamebacklog.admin.dto.AuditLogResponse;
import com.milobeene.gamebacklog.admin.dto.GameNameUpdateRequest;
import com.milobeene.gamebacklog.admin.dto.MasterInfoUpdateRequest;
import com.milobeene.gamebacklog.admin.dto.MasterNameRequest;
import com.milobeene.gamebacklog.admin.service.GameMergeService;
import com.milobeene.gamebacklog.admin.service.MasterDataService;
import com.milobeene.gamebacklog.common.dto.IdResponse;
import com.milobeene.gamebacklog.admin.service.AdminQueryService;
import com.milobeene.gamebacklog.common.dto.PageResponse;
import com.milobeene.gamebacklog.game.dto.GameResyncResult;
import com.milobeene.gamebacklog.game.service.GameResyncService;
import com.milobeene.gamebacklog.game.service.GameService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 관리자 전용 (I-9).
 *
 * 인가는 여기 애노테이션이 아니라 `SecurityConfig`의 `/api/admin/**` 규칙이 건다 —
 * 경로 하나로 묶여 있어야 "어디가 관리자 전용인지"를 한곳에서 볼 수 있다.
 * 이 경로의 모든 요청은 **조회를 포함해** 감사 로그에 남는다 (NFR-S8).
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminQueryService adminQueryService;
    private final GameService gameService;
    private final GameResyncService gameResyncService;
    private final GameMergeService gameMergeService;
    private final MasterDataService masterDataService;

    /** 회원 목록 (FR-ADM-03) */
    @GetMapping("/members")
    public PageResponse<AdminMemberResponse> members(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return adminQueryService.findMembers(page, size);
    }

    /**
     * 마스터 게임명 수정 + 전파 (FR-ADM-01).
     * 서비스는 A-7에서 이미 만들어뒀다. Phase 3에서 붙는 건 **인가뿐**이다.
     */
    @PutMapping("/games/{gameId}/name")
    public Map<String, Integer> updateGameName(@PathVariable Long gameId,
                                               @Valid @RequestBody GameNameUpdateRequest request) {
        return Map.of("updatedEntries", gameService.updateName(gameId, request.name()));
    }

    /**
     * 마스터 정보 수정 + 전파 (FR-ADM-01). 전체 교체다.
     * 회원은 마음에 안 드는 값을 개인 오버라이드로 덮어 쓴다 — 여기서 바꿔도 그 오버라이드는 안 건드린다
     */
    @PutMapping("/games/{gameId}")
    public Map<String, Integer> updateGameInfo(@PathVariable Long gameId,
                                               @Valid @RequestBody MasterInfoUpdateRequest request) {
        int updated = gameService.syncMasterInfo(
                gameId,
                request.developers(),
                request.publishers(),
                request.genres(),
                request.releasedOn(),
                com.milobeene.gamebacklog.common.dto.MoneyRequest.toMoney(request.listPrice()));
        return Map.of("updatedEntries", updated);
    }

    /**
     * RAWG 재동기화 (FR-GAME-05, J-5).
     *
     * POST인 이유 — 멱등해 보이지만 실제로는 "지금 시점의 RAWG를 가져온다"는 행위고,
     * lastSyncedAt이 매번 바뀐다. 개인 오버라이드는 영향을 받지 않는다 (§6.2).
     * 자동 배치는 두지 않았다 — COULD 항목이라 수동 트리거로 충분하다
     */
    @PostMapping("/games/{gameId}/resync")
    public GameResyncResult resyncGame(@PathVariable Long gameId) {
        return gameResyncService.resync(gameId);
    }

    /**
     * 중복 마스터 병합 (FR-ADM-02). source의 항목을 target으로 옮기고 source를 지운다.
     * 양쪽을 모두 담은 회원이 있으면 409 — 어느 쪽 기록을 살릴지 서버가 정할 수 없다
     */
    @PostMapping("/games/{sourceGameId}/merge-into/{targetGameId}")
    public Map<String, Integer> mergeGames(@PathVariable Long sourceGameId,
                                           @PathVariable Long targetGameId) {
        return Map.of("movedEntries", gameMergeService.merge(sourceGameId, targetGameId));
    }

    /* ── 플랫폼·기기·에뮬레이터 마스터 (FR-ADM-04). 삭제는 없다 ───────────────── */

    @PostMapping("/platforms")
    public IdResponse createPlatform(@Valid @RequestBody MasterNameRequest request) {
        return IdResponse.of(masterDataService.createPlatform(request.name()));
    }

    @PutMapping("/platforms/{platformId}")
    public void renamePlatform(@PathVariable Long platformId,
                               @Valid @RequestBody MasterNameRequest request) {
        masterDataService.renamePlatform(platformId, request.name());
    }

    @PostMapping("/devices")
    public IdResponse createDevice(@Valid @RequestBody MasterNameRequest request) {
        return IdResponse.of(masterDataService.createDevice(request.name()));
    }

    @PutMapping("/devices/{deviceId}")
    public void renameDevice(@PathVariable Long deviceId,
                             @Valid @RequestBody MasterNameRequest request) {
        masterDataService.renameDevice(deviceId, request.name());
    }

    @PostMapping("/emulators")
    public IdResponse createEmulator(@Valid @RequestBody MasterNameRequest request) {
        return IdResponse.of(masterDataService.createEmulator(request.name()));
    }

    @PutMapping("/emulators/{emulatorId}")
    public void renameEmulator(@PathVariable Long emulatorId,
                               @Valid @RequestBody MasterNameRequest request) {
        masterDataService.renameEmulator(emulatorId, request.name());
    }

    /** 감사 로그 조회 (FR-ADM-05). 이 조회도 로그에 남는다 */
    @GetMapping("/audit-logs")
    public PageResponse<AuditLogResponse> auditLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return adminQueryService.findAuditLogs(page, size);
    }
}
