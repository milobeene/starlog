package com.milobeene.gamebacklog.game.service;

import com.milobeene.gamebacklog.backlog.repository.BacklogEntryRepository;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GameService {

    private final GameRepository gameRepository;
    private final BacklogEntryRepository backlogEntryRepository;

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
