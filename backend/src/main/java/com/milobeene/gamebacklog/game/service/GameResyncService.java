package com.milobeene.gamebacklog.game.service;

import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.game.client.RawgClient;
import com.milobeene.gamebacklog.game.client.RawgGameDetail;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;
import com.milobeene.gamebacklog.game.dto.GameResyncResult;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 마스터 재동기화 (J-5, FR-GAME-05).
 *
 * GameResolver와 같은 모양이다 — 외부 호출은 트랜잭션 밖에서, DB 반영은 GameService 안에서.
 * 그래서 이 클래스에도 @Transactional이 없다.
 *
 * 개인 오버라이드는 건드리지 않는다 (§6.2). 오버라이드는 BacklogEntry에 있고
 * 여기서는 Game만 만지므로 자동으로 성립한다 — 코드로 막을 게 없다
 */
@Service
@RequiredArgsConstructor
public class GameResyncService {

    private final RawgClient rawgClient;
    private final GameRepository gameRepository;
    private final GameService gameService;

    public GameResyncResult resync(Long gameId) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new NotFoundException("게임을 찾을 수 없습니다. id=" + gameId));

        if (game.getSource() != GameSource.RAWG || game.getExternalId() == null) {
            // 수동 등록 게임은 원본이 없다. 400으로 끊는다 — 조용히 넘어가면 "동기화됐다"로 읽힌다
            throw new InvalidInputException("RAWG에서 가져온 게임만 재동기화할 수 있습니다. id=" + gameId);
        }

        RawgGameDetail detail = rawgClient.findById(game.getExternalId());

        return gameService.applyRawgSync(gameId, detail.name(), detail.developers(),
                detail.publishers(), detail.genres(), detail.releasedOn(),
                detail.averagePlaytimeHours());
    }
}
