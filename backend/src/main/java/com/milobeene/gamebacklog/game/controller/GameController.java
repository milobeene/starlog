package com.milobeene.gamebacklog.game.controller;

import com.milobeene.gamebacklog.game.dto.GameSearchResponse;
import com.milobeene.gamebacklog.game.service.GameService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 마스터 게임 (H-3에서 검색만 신설).
 *
 * 회원 식별이 없는 유일한 조회다 — 마스터는 공용 데이터라 내 것/남의 것 구분이 없다.
 * 관리자용 이름 수정(§2.4)은 인가가 붙는 Phase 3(I-9)에서 연다
 */
@RestController
@RequestMapping("/api/games")
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;

    @GetMapping
    public List<GameSearchResponse> search(@RequestParam(required = false) String q) {
        return gameService.search(q);
    }
}
