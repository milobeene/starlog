package com.milobeene.gamebacklog.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.gamebacklog.common.exception.ExternalApiException;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.game.client.CatalogGameDetail;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;
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

/** 온디맨드 캐시 (J-3, FR-GAME-02·03) — 핵심은 "IGDB를 몇 번 부르느냐"다 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
@Import(FakeGameCatalogClient.class)
class GameResolverTest {

    @Autowired GameResolver gameResolver;
    @Autowired GameRepository gameRepository;
    @Autowired FakeGameCatalogClient catalog;
    @Autowired EntityManager em;

    @BeforeEach
    void setUp() {
        catalog.reset();
    }

    @Test
    public void gameId가_오면_IGDB를_부르지_않는다() {
        //given
        Game game = saveManualGame("동네 오락실 게임");

        //when
        Long resolved = gameResolver.resolve(game.getId(), null);

        //then
        assertThat(resolved).isEqualTo(game.getId());
        assertThat(catalog.detailCalls).isEmpty();
    }

    @Test
    public void 이미_캐시된_externalId면_API를_한_번도_안_부른다() {
        //given — FR-GAME-03
        Game cached = saveCatalogGame("Hollow Knight", "9767");

        //when
        Long resolved = gameResolver.resolve(null, "9767");

        //then
        assertThat(resolved).isEqualTo(cached.getId());
        assertThat(catalog.detailCalls).isEmpty();
    }

    @Test
    public void 캐시에_없으면_상세를_한_번_부르고_마스터에_저장한다() {
        //given — FR-GAME-02
        catalog.willHaveDetail(CatalogGameDetail.basic("9767", "Hollow Knight",
                List.of("Team Cherry"), List.of("Team Cherry"), List.of("Action", "Indie"),
                LocalDate.of(2017, 2, 24), "cobfzp", 30));

        //when
        Long gameId = gameResolver.resolve(null, "9767");

        //then
        assertThat(catalog.detailCalls).containsExactly("9767");

        Game saved = em.find(Game.class, gameId);
        assertThat(saved.getSource()).isEqualTo(GameSource.IGDB);
        assertThat(saved.getExternalId()).isEqualTo("9767");
        assertThat(saved.getDevelopers()).containsExactly("Team Cherry");
        assertThat(saved.getMasterGenres()).containsExactly("Action", "Indie");
        assertThat(saved.getReleasedOn()).isEqualTo(LocalDate.of(2017, 2, 24));
        assertThat(saved.getMainExtraHours()).isEqualTo(30);
        assertThat(saved.getLastSyncedAt()).isNotNull();
    }

    @Test
    public void 두_번째_요청부터는_API를_안_탄다() {
        //given
        catalog.willFind("9767", "Hollow Knight", LocalDate.of(2017, 2, 24));

        //when — 같은 게임을 두 번 담는 상황 (다른 회원이)
        Long first = gameResolver.resolve(null, "9767");
        em.flush();
        Long second = gameResolver.resolve(null, "9767");

        //then — 캐시가 실제로 먹는지는 호출 횟수로만 확인된다
        assertThat(second).isEqualTo(first);
        assertThat(catalog.detailCalls).containsExactly("9767");
    }

    @Test
    public void 둘_다_없으면_400이다() {
        //when //then
        assertThatThrownBy(() -> gameResolver.resolve(null, "   "))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void IGDB에_없는_id면_404다() {
        //when //then — 장애가 아니라 잘못된 id다
        assertThatThrownBy(() -> gameResolver.resolve(null, "999999"))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    public void IGDB가_죽으면_아무것도_저장하지_않는다() {
        //given — FR-SYS-04 부분 저장 금지
        long before = gameRepository.findAll().size();
        catalog.willFail(new ExternalApiException(ExternalApiException.Service.GAME_CATALOG, "타임아웃"));

        //when //then
        assertThatThrownBy(() -> gameResolver.resolve(null, "9767"))
                .isInstanceOf(ExternalApiException.class);

        em.flush();
        assertThat(gameRepository.findAll()).hasSize((int) before);
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
