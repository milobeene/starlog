package com.milobeene.gamebacklog.support;

import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.game.client.RawgClient;
import com.milobeene.gamebacklog.game.client.RawgGameDetail;
import com.milobeene.gamebacklog.game.client.RawgGameSummary;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * RAWG 포트를 가로채는 테스트 구현. CapturingAuthMailSender와 같은 자리다.
 *
 * 테스트가 실제 RAWG를 때리면 안 되는 이유는 느려서가 아니다 —
 * 결과가 남의 손에 있으면 "몇 건이 나와야 한다"를 단정할 수 없고, 키가 없는 CI에서 전부 빨개진다.
 * 호출 횟수를 세는 이유는 FR-GAME-03("이미 있으면 API 0회")이 곧 호출 횟수 검증이기 때문
 */
@TestConfiguration
public class FakeRawgClient implements RawgClient {

    public final List<String> searchCalls = new ArrayList<>();
    public final List<String> detailCalls = new ArrayList<>();

    private final List<RawgGameSummary> searchResults = new ArrayList<>();
    private final Map<String, RawgGameDetail> details = new HashMap<>();
    private RuntimeException failure;

    public void reset() {
        searchCalls.clear();
        detailCalls.clear();
        searchResults.clear();
        details.clear();
        failure = null;
    }

    /** 검색 결과를 심고, 같은 게임의 상세도 자동으로 같이 심는다 (담기 테스트가 편해진다) */
    public FakeRawgClient willFind(String rawgId, String name, LocalDate releasedOn) {
        searchResults.add(new RawgGameSummary(rawgId, name, releasedOn));
        details.put(rawgId, new RawgGameDetail(rawgId, name,
                List.of("개발사"), List.of("퍼블리셔"), List.of("Action"), releasedOn, 12));
        return this;
    }

    public FakeRawgClient willHaveDetail(RawgGameDetail detail) {
        details.put(detail.rawgId(), detail);
        return this;
    }

    /** 장애 주입 (J-6). 검색·상세 양쪽이 같은 예외로 실패한다 */
    public FakeRawgClient willFail(RuntimeException e) {
        this.failure = e;
        return this;
    }

    @Override
    public List<RawgGameSummary> search(String keyword) {
        searchCalls.add(keyword);
        if (failure != null) {
            throw failure;
        }
        return List.copyOf(searchResults);
    }

    @Override
    public RawgGameDetail findById(String rawgId) {
        detailCalls.add(rawgId);
        if (failure != null) {
            throw failure;
        }
        RawgGameDetail detail = details.get(rawgId);
        if (detail == null) {
            throw new NotFoundException("RAWG에서 게임을 찾을 수 없습니다. id=" + rawgId);
        }
        return detail;
    }

    @Bean
    @Primary
    RawgClient fakeRawgClient() {
        return this;
    }
}
