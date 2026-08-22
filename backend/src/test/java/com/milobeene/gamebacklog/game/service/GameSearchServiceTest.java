package com.milobeene.gamebacklog.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.gamebacklog.common.exception.ExternalApiException;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;
import com.milobeene.gamebacklog.game.dto.GameSearchResponse;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.support.FakeGameCatalogClient;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/** 검색 (J-2, FR-GAME-01) — 로컬 마스터와 IGDB 결과를 어떻게 합치는지 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
@Import(FakeGameCatalogClient.class)
class GameSearchServiceTest {

    @Autowired GameSearchService gameSearchService;
    @Autowired GameRepository gameRepository;
    @Autowired FakeGameCatalogClient catalog;
    @Autowired EntityManager em;

    @BeforeEach
    void setUp() {
        catalog.reset();
    }

    @Test
    public void 마스터에_이미_있는_게임은_gameId가_채워진다() {
        //given
        Game cached = saveCatalogGame("Hollow Knight", "9767");
        catalog.willFind("9767", "Hollow Knight", LocalDate.of(2017, 2, 24));

        //when
        List<GameSearchResponse> results = gameSearchService.search("hollow");

        //then — 프론트는 이 gameId를 그대로 보내면 되고, 담을 때 IGDB를 안 탄다 (FR-GAME-03)
        assertThat(results).hasSize(1);
        assertThat(results.get(0).gameId()).isEqualTo(cached.getId());
        assertThat(results.get(0).externalId()).isEqualTo("9767");
    }

    @Test
    public void 마스터에_없는_게임은_gameId가_null이고_externalId만_있다() {
        //given
        catalog.willFind("3498", "Grand Theft Auto V", LocalDate.of(2013, 9, 17));

        //when
        List<GameSearchResponse> results = gameSearchService.search("gta");

        //then
        assertThat(results).hasSize(1);
        assertThat(results.get(0).gameId()).isNull();
        assertThat(results.get(0).externalId()).isEqualTo("3498");
        assertThat(results.get(0).source()).isEqualTo(GameSource.IGDB);
    }

    @Test
    public void 마스터에_있으면_IGDB_원본이_아니라_마스터_이름이_나간다() {
        //given — 관리자가 마스터 이름을 한글로 고쳐둔 상태
        Game cached = saveCatalogGame("할로우 나이트", "9767");
        catalog.willFind("9767", "Hollow Knight", LocalDate.of(2017, 2, 24));

        //when
        List<GameSearchResponse> results = gameSearchService.search("나이트");

        //then — 고쳐둔 이름이 IGDB 원본으로 되돌아가면 안 된다
        assertThat(results.get(0).gameId()).isEqualTo(cached.getId());
        assertThat(results.get(0).name()).isEqualTo("할로우 나이트");
    }

    @Test
    public void 수동_등록_게임도_검색에_같이_나온다() {
        //given — IGDB에 없어서 누군가 손으로 넣은 게임 (FR-GAME-04)
        Game manual = saveManualGame("동네 오락실 게임");
        catalog.willFind("3498", "Grand Theft Auto V", LocalDate.of(2013, 9, 17));

        //when
        List<GameSearchResponse> results = gameSearchService.search("게임");

        //then
        assertThat(results).hasSize(2);
        assertThat(results.get(0).gameId()).isEqualTo(manual.getId());
        assertThat(results.get(0).source()).isEqualTo(GameSource.MANUAL);
    }

    @Test
    public void 수동_등록이_아닌_로컬_게임은_두_번_나오지_않는다() {
        //given — 로컬 검색과 IGDB 검색에 모두 걸리는 게임
        saveCatalogGame("Hollow Knight", "9767");
        catalog.willFind("9767", "Hollow Knight", LocalDate.of(2017, 2, 24));

        //when
        List<GameSearchResponse> results = gameSearchService.search("hollow");

        //then — 로컬 검색이 MANUAL만 보기 때문에 중복이 안 생긴다
        assertThat(results).hasSize(1);
    }

    @Test
    public void 검색어가_비면_IGDB를_부르지도_않는다() {
        //given
        saveManualGame("Hollow Knight");

        //when
        List<GameSearchResponse> results = gameSearchService.search("   ");

        //then — 전체를 퍼주지 않고, 낭비할 호출도 없다
        assertThat(results).isEmpty();
        assertThat(catalog.searchCalls).isEmpty();
    }

    @Test
    public void IGDB가_죽으면_로컬_결과만_주지_않고_실패한다() {
        //given — 로컬에도 걸리는 게 있지만
        saveManualGame("Hollow Knight");
        catalog.willFail(new ExternalApiException("타임아웃"));

        //when //then — 부분 결과는 "IGDB에 없는 게임"으로 오해된다 (FR-SYS-04)
        assertThatThrownBy(() -> gameSearchService.search("hollow"))
                .isInstanceOf(ExternalApiException.class);
    }

    private Game saveCatalogGame(String name, String externalId) {
        Game game = Game.fromCatalog(name, externalId, LocalDateTime.now());
        gameRepository.persist(game);
        em.flush();
        return game;
    }

    private Game saveManualGame(String name) {
        Game game = Game.manual(name);
        gameRepository.persist(game);
        em.flush();
        return game;
    }
}
