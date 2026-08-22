package com.milobeene.gamebacklog.game.client;

import java.util.List;

/**
 * RAWG 접근 포트 (J-1). AuthMailSender와 같은 이유로 인터페이스를 둔다 —
 * 테스트가 실제 RAWG를 때리면 안 되고, API 키 없이도 CI가 돌아야 한다.
 *
 * 구현체는 HttpRawgClient 하나뿐이고, 그 자체는 MockRestServiceServer로 따로 검증한다
 */
public interface RawgClient {

    /** 이름으로 검색. 상한은 서버(RawgProperties.searchLimit)가 정한다 */
    List<RawgGameSummary> search(String keyword);

    /**
     * 게임 상세. 담기 직전 딱 한 번 불린다.
     *
     * @throws com.milobeene.gamebacklog.common.exception.NotFoundException RAWG에 없는 id
     * @throws com.milobeene.gamebacklog.common.exception.ExternalApiException 그 외 모든 실패 (FR-SYS-04)
     */
    RawgGameDetail findById(String rawgId);
}
