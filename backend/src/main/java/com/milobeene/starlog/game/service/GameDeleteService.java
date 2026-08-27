package com.milobeene.starlog.game.service;

import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.game.repository.GameRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 마스터 게임 완전 삭제 (v1.0 §10-3).
 *
 * ## 왜 휴지통을 안 거치나
 *
 * 마스터를 지우는 건 "이 게임 자체를 없앤다"는 뜻이다. 항목만 휴지통에 남기면
 * **되살릴 마스터가 없어** 앞뒤가 안 맞는다. 그래서 담긴 기록까지 함께 사라진다 —
 * 그 경고는 화면이 세게 띄운다.
 *
 * ## 삭제 순서가 전부다
 *
 * `BacklogEntry ↔ Playthrough`가 **서로를 참조하므로**(lastPlaythrough 비정규화, §7.2)
 * 항목의 참조를 먼저 끊어야 회차를 지울 수 있다. `BacklogService.purge`와 같은 규칙을
 * **게임 하나에 딸린 전부**로 넓힌 것이다.
 *
 * 중복 방지가 있어 실제 참조는 0건 아니면 1건이지만, 쿼리는 개수를 가정하지 않는다
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GameDeleteService {

    private final EntityManager em;
    private final GameRepository gameRepository;

    /** 자식 → 부모 순서. 이 목록의 순서가 곧 명세다 */
    private static final List<String> DELETE_ORDER = List.of(
            "delete from BacklogEntryGenre x where x.backlogEntry in (select b from BacklogEntry b where b.game.id = :gameId)",
            "delete from CoverImage x where x.backlogEntry in (select b from BacklogEntry b where b.game.id = :gameId)",
            "delete from Acquisition x where x.backlogEntry in (select b from BacklogEntry b where b.game.id = :gameId)",
            "delete from Playthrough x where x.backlogEntry in (select b from BacklogEntry b where b.game.id = :gameId)",
            "delete from BacklogEntry b where b.game.id = :gameId");

    /**
     * @return 함께 사라진 백로그 항목 수
     */
    @Transactional
    public int delete(Long gameId) {
        // BaseRepository에는 existsById가 없다 — save()를 막느라 최소한만 노출한다 (설계 원칙 12)
        gameRepository.findById(gameId)
                .orElseThrow(() -> new NotFoundException("게임을 찾을 수 없습니다. id=" + gameId));

        int entries = ((Number) em.createQuery(
                        "select count(b) from BacklogEntry b where b.game.id = :gameId")
                .setParameter("gameId", gameId)
                .getSingleResult()).intValue();

        /*
         * 순환 참조를 먼저 끊는다. 벌크는 @LastModifiedDate 콜백이 안 도니
         * updatedAt을 SET 절에 직접 쓴다 (설계 원칙 13번)
         */
        em.createQuery("""
                        update BacklogEntry b
                           set b.lastPlaythrough = null, b.updatedAt = :now
                         where b.game.id = :gameId
                        """)
                .setParameter("gameId", gameId)
                .setParameter("now", java.time.LocalDateTime.now())
                .executeUpdate();
        em.flush();

        DELETE_ORDER.forEach(jpql -> em.createQuery(jpql)
                .setParameter("gameId", gameId)
                .executeUpdate());

        // 벌크는 영속성 컨텍스트를 우회한다 → 비우고 나서 부모를 지운다
        em.clear();
        em.createQuery("delete from Game g where g.id = :gameId")
                .setParameter("gameId", gameId)
                .executeUpdate();

        log.info("마스터 게임 삭제. gameId={} 함께 사라진 항목={}", gameId, entries);
        return entries;
    }
}
