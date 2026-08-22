package com.milobeene.gamebacklog.game.service;

import com.milobeene.gamebacklog.backlog.repository.BacklogEntryRepository;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.game.dto.GameResyncResult;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.common.util.TextValues;
import com.milobeene.gamebacklog.game.dto.GameSearchResponse;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import org.springframework.data.domain.PageRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.milobeene.gamebacklog.common.entity.Money;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GameService {

    private static final int SEARCH_LIMIT = 20;

    private final GameRepository gameRepository;
    private final BacklogEntryRepository backlogEntryRepository;

    /**
     * 마스터 게임 검색 (H-3). 검색어가 비면 빈 목록 — 전체를 퍼주지 않는다.
     * 상한을 서버가 정한다: 클라이언트가 개수를 요구할 수 없다
     */
    public List<GameSearchResponse> search(String keyword) {
        String normalized = TextValues.normalize(keyword);
        if (normalized == null) {
            return List.of();
        }

        return gameRepository.searchByName(normalized, PageRequest.ofSize(SEARCH_LIMIT)).stream()
                .map(GameSearchResponse::from)
                .toList();
    }

    /**
     * 마스터 정보 수정 + 전파. Phase 4 RAWG 재동기화(J-5)가 이 메서드로 들어온다.
     *
     * Game.updateMasterInfo를 직접 부르면 안 되는 이유 — releasedOn이 바뀌어도
     * 항목들의 releasedOnResolved(정렬용 비정규화)가 갱신되지 않아 목록만 조용히
     * 옛 날짜 순서로 어긋난다. 이름의 updateName처럼 전파는 서비스가 책임진다.
     * (developers·publishers·genres·listPrice는 비정규화가 없어 전파 대상이 아니다)
     *
     * @return releasedOnResolved가 갱신된 백로그 항목 수
     */
    @Transactional
    public int syncMasterInfo(Long gameId, List<String> developers, List<String> publishers,
                              List<String> masterGenres, LocalDate releasedOn, Money listPrice) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new NotFoundException("게임을 찾을 수 없습니다. id=" + gameId));

        game.updateMasterInfo(developers, publishers, masterGenres, releasedOn, listPrice);

        return backlogEntryRepository.updateReleasedOnResolvedByGameId(
                gameId, game.getReleasedOn(), LocalDateTime.now());
    }

    /**
     * 수동 등록 (FR-GAME-04, J-4). RAWG에 없는 게임을 최초 등록자가 채운다.
     *
     * 이름 중복을 막지 않는다 — 같은 이름의 다른 게임(리메이크·지역판)이 실제로 있고,
     * 진짜 중복은 관리자 병합(FR-ADM-02)이 이미 처리한다.
     * 등록 이후 수정은 관리자만이다 (AUTH-P2) — 그래서 여기엔 수정 경로가 없다
     */
    @Transactional
    public Long registerManual(String name, List<String> developers, List<String> publishers,
                               List<String> genres, LocalDate releasedOn, Money listPrice) {
        Game game = Game.manual(name);
        game.updateMasterInfo(developers, publishers, genres, releasedOn, listPrice);

        gameRepository.persist(game);

        return game.getId();
    }

    /**
     * RAWG 재동기화 반영 (FR-GAME-05, J-5). 외부 호출은 GameResyncService가 이미 끝냈고,
     * 여기는 DB 반영과 전파만 한다.
     *
     * **순서가 규칙이다.** 엔티티 변경을 먼저 다 하고 벌크 쿼리를 나중에 돌린다.
     * 벌크는 clearAutomatically = true라서 실행 직후 game이 준영속이 된다 —
     * 순서를 뒤집으면 뒤에 한 변경이 변경 감지에 안 잡혀 조용히 사라진다 (JPA 13번).
     * 같은 이유로 벌크에 넘길 값은 미리 지역 변수로 꺼내둔다
     */
    @Transactional
    public GameResyncResult applyRawgSync(Long gameId, String name, List<String> developers,
                                          List<String> publishers, List<String> genres,
                                          LocalDate releasedOn, Integer averagePlaytimeHours) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new NotFoundException("게임을 찾을 수 없습니다. id=" + gameId));

        LocalDateTime now = LocalDateTime.now();

        boolean nameChanged = name != null && !name.equals(game.getName());
        if (nameChanged) {
            game.updateName(name);
        }
        game.syncFromRawg(developers, publishers, genres, releasedOn, averagePlaytimeHours, now);

        String resolvedName = game.getName();
        LocalDate resolvedReleasedOn = game.getReleasedOn();

        int renamedEntries = nameChanged
                ? backlogEntryRepository.updateDisplayNameByGameId(gameId, resolvedName, now)
                : 0;
        int reorderedEntries =
                backlogEntryRepository.updateReleasedOnResolvedByGameId(gameId, resolvedReleasedOn, now);

        return new GameResyncResult(nameChanged, renamedEntries, reorderedEntries);
    }

    /**
     * 마스터 이름 수정 + 전파 (FR-ADM-01, A-7). 인가는 Phase 3(I-9)에서 붙는다.
     *
     * @return displayName이 갱신된 백로그 항목 수
     */
    @Transactional
    public int updateName(Long gameId, String newName) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new NotFoundException("게임을 찾을 수 없습니다. id=" + gameId));

        game.updateName(newName);

        // flush·clear는 벌크 쿼리 쪽 @Modifying 설정이 책임진다
        return backlogEntryRepository.updateDisplayNameByGameId(
                gameId, game.getName(), LocalDateTime.now());
    }
}
