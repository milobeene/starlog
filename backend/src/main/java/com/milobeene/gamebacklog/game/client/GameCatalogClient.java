package com.milobeene.gamebacklog.game.client;

import java.util.List;

/**
 * 외부 게임 DB 접근 포트 (J-1, J-7에서 이름 중립화).
 *
 * **이름에 제공자를 넣지 않는다.** 원래 `RawgClient`였는데 J-7에서 IGDB로 갈아타며
 * 이름이 곧 거짓말이 됐다. 제공자는 또 바뀔 수 있고(RAWG는 가입이 막혀 못 쓰게 됐다),
 * 그때 이 인터페이스는 그대로 남는다. AuthMailSender가 SMTP를 이름에 안 넣은 것과 같은 이유.
 *
 * 구현체는 HttpIgdbClient 하나. 테스트는 이 포트를 가짜로 갈아끼운다
 */
public interface GameCatalogClient {

    /** 이름으로 검색. 상한은 서버(IgdbProperties.searchLimit)가 정한다 */
    List<CatalogGameSummary> search(String keyword);

    /**
     * 게임 상세. 담기 직전 딱 한 번 불린다.
     *
     * @throws com.milobeene.gamebacklog.common.exception.NotFoundException 외부 DB에 없는 id
     * @throws com.milobeene.gamebacklog.common.exception.ExternalApiException 그 외 모든 실패 (FR-SYS-04)
     */
    CatalogGameDetail findById(String externalId);
}
