package com.milobeene.gamebacklog.game.domain;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 마스터 동기화 인자 묶음 (v1.7).
 *
 * record로 묶은 이유 — 인자가 16개고 그중 `Integer`가 5개, `String`이 5개다.
 * 평평하게 넘기면 **순서를 바꿔도 컴파일이 통과한다** (설계서 8번, Command record 도입과 같은 이유).
 * `mainStoryHours`와 `mainExtraHours`가 뒤바뀌어도 아무도 모른다
 */
public record CatalogSyncCommand(
        List<String> developers,
        List<String> publishers,
        List<String> masterGenres,
        LocalDate releasedOn,
        String coverImageId,
        String bannerImageId,
        String summary,
        String storyline,
        BigDecimal igdbRating,
        Integer igdbRatingCount,
        List<String> releasePlatforms,
        Integer mainStoryHours,
        Integer mainExtraHours,
        Integer completionistHours,
        Integer timeToBeatSamples
) {

    /** 수동 등록·테스트용 최소 생성 */
    public static CatalogSyncCommand of(List<String> developers, List<String> publishers,
                                        List<String> masterGenres, LocalDate releasedOn) {
        return new CatalogSyncCommand(developers, publishers, masterGenres, releasedOn,
                null, null, null, null, null, null, List.of(), null, null, null, null);
    }
}
