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

import java.util.ArrayList;
import java.util.List;

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
 * ## 소개문과 스토리라인을 **한 묶음으로** 옮긴다 (2026-08-28, 사용자 결정)
 *
 * ⚠️ IGDB 실측에서 summary는 최대 3,254자인데 **storyline은 20,764자**다. 긴 게임 하나가
 * 월 무료 한도의 4%를 먹는다. 그 비용을 알고 넣기로 했고, 대신 화면이 누르기 전에
 * **합계 글자 수**를 보여준다 — 그게 곧 이번 달 한도에서 빠질 양이다.
 *
 * 한 번에 보내는 이유 — 구글 v2는 `q`를 여러 개 받아 **같은 순서로** 돌려준다.
 * 이어 붙였다면 구분자를 넣고 다시 쪼개야 하는데, 번역기가 그 구분자를 옮겨버리면
 * 경계가 어긋난다. 호출도 한 번이라 왕복이 줄어든다
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GameTranslationService {

    private final GameRepository gameRepository;
    private final AppSettingService appSettingService;
    private final TranslationQuota quota;
    private final TranslationClient client;

    public record Result(String summaryKo, String storylineKo,
                         long usedChars, long remainingChars) {}

    @Transactional
    public Result translate(Long gameId) {
        Game game = gameRepository.findById(gameId)
                .orElseThrow(() -> new NotFoundException("게임을 찾을 수 없습니다. id=" + gameId));

        String apiKey = appSettingService.translateApiKey();
        if (apiKey == null) {
            throw new InvalidInputException("번역 키가 없습니다. 시스템 → 연결에서 넣어 주세요");
        }

        /*
         * 둘 중 있는 것만 보낸다. 스토리라인이 없는 게임이 흔한데, 빈 문자열을 보내면
         * 구글이 빈 결과를 돌려주고 **개수 검사가 헛돌 뿐** 얻는 게 없다
         */
        List<String> sources = new ArrayList<>();
        if (hasText(game.getSummary())) sources.add(game.getSummary());
        if (hasText(game.getStoryline())) sources.add(game.getStoryline());
        if (sources.isEmpty()) {
            throw new InvalidInputException("번역할 내용이 없습니다");
        }

        int chars = sources.stream().mapToInt(String::length).sum();
        // ⚠️ 보내기 전에 본다. 다녀와서 확인하면 이미 글자를 쓴 뒤다
        quota.check(chars);

        boolean ok = false;
        try {
            List<String> korean = client.toKorean(apiKey, sources);
            ok = true;

            /*
             * 보낸 순서대로 돌아온다. **보낼 때 뺀 것은 받을 때도 없다** —
             * 소개문이 없으면 첫 조각이 스토리라인이므로 같은 조건으로 되짚는다
             */
            int at = 0;
            String summaryKo = hasText(game.getSummary()) ? korean.get(at++) : null;
            String storylineKo = hasText(game.getStoryline()) ? korean.get(at) : null;

            game.applyTranslation(summaryKo, storylineKo, AppClock.now());
            log.info("소개문·스토리라인을 번역했습니다. gameId={} {}자", gameId, chars);
            return new Result(summaryKo, storylineKo, chars, remainingAfter(chars));
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
    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private long remainingAfter(int chars) {
        return Math.max(0, TranslationQuota.GUARD_MONTHLY_CHARS - quota.usedThisMonth() - chars);
    }
}
