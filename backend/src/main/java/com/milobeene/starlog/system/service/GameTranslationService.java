package com.milobeene.starlog.system.service;

import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게임 소개문을 한국어로 옮긴다 (2026-08-28).
 *
 * ## 순서가 전부다
 *
 * <pre>
 *   1. 원문을 꺼낸다
 *   2. **보내기 전에** 한도를 본다           ← 다녀와서 보면 이미 늦다
 *   3. 구글을 부른다
 *   4. 성공·실패 상관없이 쓴 만큼 기록한다     ← 실패도 구글은 세었을 수 있다
 *   5. 번역을 저장한다
 * </pre>
 *
 * 4번이 `finally`에 있는 게 요점이다. 실패했다고 안 남기면 **우리만 덜 센 것이 되고**,
 * 그 차이만큼 한도를 넘겨 돈이 나간다.
 *
 * ## storyline은 안 건드린다
 *
 * IGDB 실측에서 summary는 최대 3,254자인데 storyline은 20,764자였다.
 * 그것까지 옮기면 게임 하나가 월 무료 한도의 4%를 먹는다 — 값이 값을 못 한다
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GameTranslationService {

    private final GameRepository gameRepository;
    private final AppSettingService appSettingService;
    private final TranslationQuota quota;
    private final TranslationClient client;

    public record Result(String summaryKo, long usedChars, long remainingChars) {}

    @Transactional
    public Result translate(Long gameId) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new NotFoundException("게임을 찾을 수 없습니다. id=" + gameId));

        String apiKey = appSettingService.translateApiKey();
        if (apiKey == null) {
            throw new InvalidInputException("번역 키가 없습니다. 시스템 → 연결에서 넣어 주세요");
        }

        String source = game.getSummary();
        if (source == null || source.isBlank()) {
            throw new InvalidInputException("번역할 소개문이 없습니다");
        }

        int chars = source.length();
        // ⚠️ 보내기 전에 본다. 다녀와서 확인하면 이미 글자를 쓴 뒤다
        quota.check(chars);

        boolean ok = false;
        try {
            String korean = client.toKorean(apiKey, source);
            ok = true;
            game.applyTranslation(korean, AppClock.now());
            log.info("소개문을 번역했습니다. gameId={} {}자", gameId, chars);
            return new Result(korean, chars, remainingAfter(chars));
        } finally {
            /*
             * ⚠️ **실패해도 기록한다.** 구글은 글자를 받아 처리한 뒤 실패했을 수 있다 —
             * 우리만 안 세면 그 차이만큼 한도를 넘긴다. 적게 세는 쪽이 위험하다
             */
            quota.record(chars, ok);
        }
    }

    /**
     * 방금 쓴 것까지 반영한 남은 양.
     *
     * `quota.usage()`를 다시 부르지 않는 이유 — `record`가 **다른 트랜잭션**이라
     * 지금 트랜잭션에서는 아직 안 보인다. 직접 빼는 게 사실과 맞는다
     */
    private long remainingAfter(int chars) {
        return Math.max(0, TranslationQuota.GUARD_MONTHLY_CHARS - quota.usedThisMonth() - chars);
    }
}
