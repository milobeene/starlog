package com.milobeene.starlog.game.controller;

import com.milobeene.starlog.common.dto.IdResponse;
import com.milobeene.starlog.common.dto.MoneyRequest;
import com.milobeene.starlog.common.dto.PageResponse;
import com.milobeene.starlog.game.dto.GameMasterResponse;
import com.milobeene.starlog.game.dto.GameNameUpdateRequest;
import com.milobeene.starlog.game.dto.GameResyncResult;
import com.milobeene.starlog.game.dto.GameSearchResponse;
import com.milobeene.starlog.game.dto.ManualGameRequest;
import com.milobeene.starlog.game.dto.MasterInfoUpdateRequest;
import com.milobeene.starlog.game.service.GameDeleteService;
import com.milobeene.starlog.game.service.GameMasterService;
import com.milobeene.starlog.game.service.GameResyncService;
import com.milobeene.starlog.game.service.GameSearchService;
import com.milobeene.starlog.game.service.GameService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;
import java.util.Map;

/**
 * 마스터 게임 (J-2, J-4 + v1.0 8단계 승격).
 *
 * 회원 식별이 없는 유일한 구역이다 — 마스터는 공용 데이터라 내 것/남의 것 구분이 없다.
 *
 * ## `/api/admin`이 사라지고 여기로 합쳐졌다
 *
 * 이름·정보 수정과 재동기화는 예전에 관리자 전용이었다. **여러 사람이 공유하는 마스터를
 * 한 명이 대표로 고치는 구조**였기 때문인데, 1인 앱에서는 그 전제가 없다.
 * 인가도 감사 로그도 함께 사라졌고, 남은 것은 그냥 기능이다 (architecture §9).
 */
@RestController
@RequestMapping("/api/games")
@RequiredArgsConstructor
public class GameController {

    private final GameSearchService gameSearchService;
    private final GameService gameService;
    private final GameMasterService gameMasterService;
    private final GameResyncService gameResyncService;
    private final GameDeleteService gameDeleteService;

    /**
     * 검색 (FR-GAME-01). 로컬 수동 등록 게임 + IGDB 결과를 이어 붙인다.
     * IGDB가 죽어 있으면 502로 끝난다 — 로컬 결과만 조용히 주지 않는다 (J-6)
     */
    @GetMapping
    public List<GameSearchResponse> search(@RequestParam(required = false) String q) {
        // 빈 검색어는 IGDB를 안 부른다 (GameSearchService가 즉시 빈 목록으로 끝낸다)
        if (q == null || q.isBlank()) {
            return List.of();
        }
        return gameSearchService.search(q);
    }

    /**
     * 마스터 목록·검색.
     *
     * 위 `search`와 갈라둔 이유 — 저쪽은 담기 화면용이라 **IGDB 결과를 섞어 주고** 페이지네이션이 없다.
     * 마스터 관리 화면은 "이미 내 DB에 있는 것"만 봐야 해서 섞이면 방해가 된다
     */
    @GetMapping("/master")
    public PageResponse<GameMasterResponse> master(@RequestParam(required = false) String q,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "30") int size) {
        return gameMasterService.find(q, page, size);
    }

    /**
     * 일괄 동기화 대상 (§10-2).
     *
     * **먼저 목록을 주고 승인을 받는다.** 곧장 돌리면 몇 개가 얼마나 걸릴지 모른 채
     * IGDB를 수십 번 두드리게 된다. 화면이 이 목록을 팝업으로 보여주고,
     * 사용자가 확인하면 한 건씩 `/resync`를 부른다 — 진행률은 남은 개수로 나온다
     */
    @GetMapping("/outdated")
    public List<GameMasterResponse> outdated() {
        return gameMasterService.outdated();
    }

    /** 수동 등록 (FR-GAME-04). IGDB 키가 없어도 앱이 온전히 쓸모 있게 하는 길이다 */
    @PostMapping
    public ResponseEntity<IdResponse> registerManual(@Valid @RequestBody ManualGameRequest request) {
        Long gameId = gameService.registerManual(
                request.name(), request.developers(), request.publishers(),
                request.genres(), request.releasedOn(), MoneyRequest.toMoney(request.listPrice()));

        return ResponseEntity.created(URI.create("/api/games/" + gameId))
                .body(IdResponse.of(gameId));
    }

    /** 마스터 게임명 수정 + 전파 (FR-ADM-01) */
    @PutMapping("/{gameId}/name")
    public Map<String, Integer> updateName(@PathVariable Long gameId,
                                           @Valid @RequestBody GameNameUpdateRequest request) {
        return Map.of("updatedEntries", gameService.updateName(gameId, request.name()));
    }

    /**
     * 마스터 정보 수정 + 전파 (FR-ADM-01). 전체 교체다.
     * 마음에 안 드는 값은 개인 오버라이드로 덮어 쓴다 — 여기서 바꿔도 그 오버라이드는 안 건드린다
     */
    @PutMapping("/{gameId}")
    public Map<String, Integer> updateInfo(@PathVariable Long gameId,
                                           @Valid @RequestBody MasterInfoUpdateRequest request) {
        int updated = gameService.syncMasterInfo(
                gameId,
                request.developers(), request.publishers(), request.genres(),
                request.releasedOn(), MoneyRequest.toMoney(request.listPrice()));
        return Map.of("updatedEntries", updated);
    }

    /**
     * 외부 DB 재동기화 (FR-GAME-05, J-5).
     *
     * POST인 이유 — 멱등해 보이지만 실제로는 "지금 시점의 외부 DB를 가져온다"는 행위고,
     * `lastSyncedAt`이 매번 바뀐다. 개인 오버라이드는 영향을 받지 않는다
     */
    @PostMapping("/{gameId}/resync")
    public GameResyncResult resync(@PathVariable Long gameId) {
        return gameResyncService.resync(gameId);
    }

    /**
     * 마스터 삭제 (v1.0 §10-3). **휴지통을 거치지 않고 완전 삭제한다.**
     *
     * 항목만 휴지통에 남기면 되살릴 마스터가 없어 앞뒤가 안 맞는다.
     * 중복 방지가 있어 참조는 0건 아니면 1건이라 "누가 쓰고 있나"를 물을 필요도 없다 —
     * 경고 한 줄이면 충분하고, 그 경고는 화면이 띄운다
     */
    @DeleteMapping("/{gameId}")
    public Map<String, Integer> deleteMaster(@PathVariable Long gameId) {
        return Map.of("deletedEntries", gameDeleteService.delete(gameId));
    }
}
