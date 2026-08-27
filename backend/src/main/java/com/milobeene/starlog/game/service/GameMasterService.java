package com.milobeene.starlog.game.service;

import com.milobeene.starlog.common.dto.PageResponse;
import com.milobeene.starlog.common.util.TextValues;
import com.milobeene.starlog.game.dto.GameMasterResponse;
import com.milobeene.starlog.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;

/**
 * 마스터 게임 목록 (v1.0 8단계에서 `admin/`에서 승격).
 *
 * **관리자라서가 아니라 자기 DB의 주인이라서 쓴다.** 예전엔 여러 사람이 공유하는 마스터를
 * 한 명이 대표로 고치는 구조였고, 그래서 인가와 감사 로그가 붙어 있었다.
 * 1인 앱에서는 그 전제가 통째로 사라져 그냥 기능이 된다 (architecture §9).
 *
 * `/api/games`(담기 화면용)와 갈라둔 이유는 그대로다 — 저쪽은 **IGDB 결과를 섞어 주고**
 * 페이지네이션이 없다. 여기는 "이미 마스터에 있는 것"만 다룬다
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GameMasterService {

    /** 상한은 서버가 정한다. 클라이언트가 "전부 주세요"를 할 수 없어야 한다 */
    private static final int MAX_SIZE = 100;

    private final GameRepository gameRepository;

    /** 검색어가 없으면 전체를 이름순으로 준다 */
    public PageResponse<GameMasterResponse> find(String keyword, int page, int size) {
        // 빈 검색어는 null이 아니라 ''로 바인딩한다 — PG는 타입 문맥 없는 null 파라미터를 거부한다
        String normalized = Objects.requireNonNullElse(TextValues.normalize(keyword), "");

        return PageResponse.from(
                gameRepository.searchPage(normalized, PageRequest.of(
                                Math.max(page, 0), Math.min(Math.max(size, 1), MAX_SIZE)))
                        .map(GameMasterResponse::from));
    }
}
