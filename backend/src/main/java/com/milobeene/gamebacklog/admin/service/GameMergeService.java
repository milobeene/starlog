package com.milobeene.gamebacklog.admin.service;

import com.milobeene.gamebacklog.backlog.repository.BacklogEntryRepository;
import com.milobeene.gamebacklog.common.exception.ConflictException;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 중복 마스터 병합 (FR-ADM-02).
 *
 * 마스터는 삭제하지 않는 게 원칙이지만(§7.4), **병합은 그 예외다** — 중복 등록을 정리할
 * 유일한 경로이고, 원본을 남겨두면 검색 결과에 계속 유령이 뜬다.
 *
 * 충돌을 조용히 처리하지 않는다. 같은 회원이 두 마스터를 둘 다 담고 있으면 어느 쪽 회차·취득을
 * 살릴지 서버가 정할 수 없다 — 409로 돌려보내고 관리자가 판단하게 한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GameMergeService {

    private final GameRepository gameRepository;
    private final BacklogEntryRepository backlogEntryRepository;

    @Transactional
    public int merge(Long sourceGameId, Long targetGameId) {
        if (sourceGameId.equals(targetGameId)) {
            throw new InvalidInputException("같은 게임끼리는 병합할 수 없습니다");
        }

        Game source = findGame(sourceGameId);
        Game target = findGame(targetGameId);

        List<Long> conflicts = backlogEntryRepository.findMemberIdsHavingBoth(sourceGameId, targetGameId);
        if (!conflicts.isEmpty()) {
            throw new ConflictException(
                    "양쪽을 모두 담은 회원이 %d명 있습니다. 먼저 정리해야 병합할 수 있습니다"
                            .formatted(conflicts.size()));
        }

        int moved = backlogEntryRepository.repointGame(
                sourceGameId, target, target.getName(), target.getReleasedOn(), LocalDateTime.now());

        // 벌크가 이미 flush·clear를 돌렸으므로 source는 준영속이다. 다시 잡아서 지운다
        gameRepository.findById(sourceGameId).ifPresent(gameRepository::delete);

        log.info("마스터 병합: {}({}) → {}({}), 항목 {}건 이동",
                source.getName(), sourceGameId, target.getName(), targetGameId, moved);
        return moved;
    }

    private Game findGame(Long gameId) {
        return gameRepository.findById(gameId)
                .orElseThrow(() -> new NotFoundException("게임을 찾을 수 없습니다. id=" + gameId));
    }
}
