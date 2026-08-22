package com.milobeene.gamebacklog.game.client;

import java.time.LocalDate;
import java.util.List;

/**
 * RAWG 게임 상세 (J-3). 마스터에 그대로 옮겨 담는 값들이다.
 *
 * 정가가 없는 이유 — RAWG는 가격 데이터를 제공하지 않는다 (§6.2). 수동 입력 전용.
 * 커버 이미지도 담지 않는다 — 커버는 개인 소유라 마스터에 두지 않는다 (§6.9)
 */
public record RawgGameDetail(
        String rawgId,
        String name,
        List<String> developers,
        List<String> publishers,
        List<String> genres,
        LocalDate releasedOn,
        Integer averagePlaytimeHours
) {
}
