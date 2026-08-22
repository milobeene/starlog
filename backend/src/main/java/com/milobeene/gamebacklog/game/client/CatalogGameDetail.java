package com.milobeene.gamebacklog.game.client;

import java.time.LocalDate;
import java.util.List;

/**
 * 게임 상세 (J-3). 마스터에 그대로 옮겨 담는 값들이다.
 *
 * 정가가 없는 이유 — IGDB는 가격 데이터를 제공하지 않는다 (§8.1). 수동 입력 전용.
 * coverImageId는 URL이 아니라 **id**다. 크기별 URL은 표시 시점에 조합한다 (§6.10)
 */
public record CatalogGameDetail(
        String externalId,
        String name,
        List<String> developers,
        List<String> publishers,
        List<String> genres,
        LocalDate releasedOn,
        Integer timeToBeatHours,
        String coverImageId
) {
}
