package com.milobeene.gamebacklog.admin.controller;

import com.milobeene.gamebacklog.admin.dto.AdminGameResponse;
import com.milobeene.gamebacklog.admin.dto.AdminMemberResponse;
import com.milobeene.gamebacklog.admin.dto.AuditLogResponse;
import com.milobeene.gamebacklog.admin.dto.GameNameUpdateRequest;
import com.milobeene.gamebacklog.admin.dto.MasterInfoUpdateRequest;
import com.milobeene.gamebacklog.admin.service.GameMergeService;
import com.milobeene.gamebacklog.admin.service.AdminQueryService;
import com.milobeene.gamebacklog.admin.service.MemberApprovalService;
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

import java.time.LocalDate;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat.ISO;

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
    private final MemberApprovalService memberApprovalService;

    /** 회원 목록·검색 (FR-ADM-03). 이메일 부분 일치 + 가입일 범위 */
    @GetMapping("/members")
    public PageResponse<AdminMemberResponse> members(
            @RequestParam(required = false) String email,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = ISO.DATE) LocalDate joinedFrom,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = ISO.DATE) LocalDate joinedTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        return adminQueryService.findMembers(email, joinedFrom, joinedTo, page, size);
    }

    /**
     * 마스터 게임 목록·검색 (FR-ADM-01).
     *
     * `/api/games`와 갈라둔 이유 — 저쪽은 담기 화면용이라 **IGDB 결과를 섞어 준다.**
     * 관리자는 "이미 마스터에 있는 것"만 고치므로 섞이면 방해가 되고, 페이지네이션도 안 된다.
     * IGDB까지 보고 싶으면 화면이 `/api/games`를 대신 부른다
     */
    @GetMapping("/games")
    public PageResponse<AdminGameResponse> games(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        return adminQueryService.findGames(q, page, size);
    }

    /**
     * 가입 승인 (FR-ADM-06). 승인 전까지 그 계정은 로그인이 403이라 아무것도 못 한다.
     * 거절은 별도 상태를 두지 않는다 — 대기 상태로 놔두거나 계정을 지운다
     */
    @PostMapping("/members/{memberId}/approve")
    public void approveMember(@PathVariable Long memberId) {
        memberApprovalService.approve(memberId);
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
     * 외부 DB 재동기화 (FR-GAME-05, J-5).
     *
     * POST인 이유 — 멱등해 보이지만 실제로는 "지금 시점의 외부 DB를 가져온다"는 행위고,
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

    /** 감사 로그 조회 (FR-ADM-05). 이 조회도 로그에 남는다 */
    @GetMapping("/audit-logs")
    public PageResponse<AuditLogResponse> auditLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int size) {
        return adminQueryService.findAuditLogs(page, size);
    }
}
