package com.milobeene.gamebacklog.game.controller;

import com.milobeene.gamebacklog.common.dto.IdResponse;
import com.milobeene.gamebacklog.common.dto.MoneyRequest;
import com.milobeene.gamebacklog.game.dto.GameSearchResponse;
import com.milobeene.gamebacklog.game.dto.ManualGameRequest;
import com.milobeene.gamebacklog.game.service.GameSearchService;
import com.milobeene.gamebacklog.game.service.GameService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

/**
 * 마스터 게임 (J-2, J-4).
 *
 * 회원 식별이 없는 유일한 조회다 — 마스터는 공용 데이터라 내 것/남의 것 구분이 없다.
 * 관리자용 이름·정보 수정과 재동기화는 /api/admin 아래에 있다 (인가가 경로 하나로 묶인다)
 */
@RestController
@RequestMapping("/api/games")
@RequiredArgsConstructor
public class GameController {

    private final GameSearchService gameSearchService;
    private final GameService gameService;

    /**
     * 검색 (FR-GAME-01). 로컬 수동 등록 게임 + IGDB 결과를 이어 붙인다.
     * IGDB가 죽어 있으면 502로 끝난다 — 로컬 결과만 조용히 주지 않는다 (J-6)
     */
    @GetMapping
    public List<GameSearchResponse> search(@RequestParam(required = false) String q) {
        return gameSearchService.search(q);
    }

    /**
     * 수동 등록 (FR-GAME-04). 로그인한 회원이면 누구나 등록할 수 있다.
     * 수정은 관리자만이라(AUTH-P2) 여기에 PUT이 없다
     */
    @PostMapping
    public ResponseEntity<IdResponse> registerManual(@Valid @RequestBody ManualGameRequest request) {
        Long gameId = gameService.registerManual(
                request.name(), request.developers(), request.publishers(),
                request.genres(), request.releasedOn(), MoneyRequest.toMoney(request.listPrice()));

        return ResponseEntity.created(URI.create("/api/games/" + gameId))
                .body(IdResponse.of(gameId));
    }
}
