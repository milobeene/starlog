package com.milobeene.starlog.game.client;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 게임 상세 (J-3, v1.7에서 상세 화면용 필드로 확장).
 *
 * 정가가 없는 이유 — IGDB는 가격을 제공하지 않는다 (§8.1). 수동 입력 전용이고,
 * 실시간 시세(ITAD 등)는 범위 밖이다.
 *
 * 이미지는 URL이 아니라 **id**다. 크기별 URL은 표시 시점에 조합한다 (§6.10)
 */
public record CatalogGameDetail(
        String externalId,
        String name,
        List<String> developers,
        List<String> publishers,
        List<String> genres,
        LocalDate releasedOn,
        String coverImageId,

        // ── v1.7 상세 화면용
        String bannerImageId,
        String summary,
        String storyline,
        /** 유저 평점 0~100. 평론가 평점(aggregated_rating)은 쓰지 않는다 */
        BigDecimal igdbRating,
        Integer igdbRatingCount,
        /** PS5·Switch 같은 하드웨어 기종. ⚠️ Platform 엔티티(Steam·PSN)와 다른 개념 */
        List<String> releasePlatforms,

        /** 클리어 소요 3종 (초 → 시간). All Styles는 IGDB에 없어 만들지 않는다 */
        Integer mainStoryHours,
        Integer mainExtraHours,
        Integer completionistHours,
        /** 표본 수. 퍼센트(Confidence)로 환산하지 않는다 */
        Integer timeToBeatSamples
) {

    /**
     * 상세 화면 필드 없이 최소 구성. 시드·테스트가 17개 인자를 늘어놓지 않게 한다.
     * 실제 IGDB 응답은 HttpIgdbClient가 전체 생성자로 만든다
     */
    public static CatalogGameDetail basic(String externalId, String name,
                                          List<String> developers, List<String> publishers,
                                          List<String> genres, LocalDate releasedOn,
                                          String coverImageId, Integer mainExtraHours) {
        return new CatalogGameDetail(externalId, name, developers, publishers, genres,
                releasedOn, coverImageId,
                null, null, null, null, null, List.of(),
                null, mainExtraHours, null, null);
    }
}
