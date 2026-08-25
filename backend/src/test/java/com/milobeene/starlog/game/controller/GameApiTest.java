package com.milobeene.starlog.game.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.common.exception.ExternalApiException;
import com.milobeene.starlog.game.client.CatalogGameDetail;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.domain.GameSource;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.support.ControllerTestSupport;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/** Phase 4 전체를 HTTP로 훑는다 — 검색(J-2), 담기 캐시(J-3), 수동 등록(J-4), 재동기화(J-5), 장애(J-6) */
class GameApiTest extends ControllerTestSupport {

    @Autowired BacklogEntryRepository backlogEntryRepository;

    @Test
    public void 검색은_로컬과_IGDB를_합쳐_돌려준다() throws Exception {
        //given
        saveGame("동네 오락실 나이트");                                  // MANUAL
        catalog.willFind("9767", "Hollow Knight", LocalDate.of(2017, 2, 24));

        //when //then
        mockMvc.perform(get("/api/games").param("q", "나이트")
                        .header("X-Member-Id", saveMember().getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].source").value("MANUAL"))
                .andExpect(jsonPath("$[1].gameId").doesNotExist())
                .andExpect(jsonPath("$[1].externalId").value("9767"));
    }

    @Test
    public void IGDB_장애면_검색이_502다() throws Exception {
        //given — FR-SYS-04
        catalog.willFail(new ExternalApiException(ExternalApiException.Service.GAME_CATALOG, "타임아웃"));

        //when //then
        mockMvc.perform(get("/api/games").param("q", "hollow")
                        .header("X-Member-Id", saveMember().getId()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("EXTERNAL_API_ERROR"));
    }

    @Test
    public void externalId로_담으면_마스터에_저장되고_항목이_생긴다() throws Exception {
        //given — FR-GAME-02
        Member member = saveMember();
        catalog.willHaveDetail(CatalogGameDetail.basic("9767", "Hollow Knight",
                List.of("Team Cherry"), List.of("Team Cherry"), List.of("Action"),
                LocalDate.of(2017, 2, 24), "cobfzp", 30));

        //when
        mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"externalId\":\"9767\"}"))
                .andExpect(status().isCreated());

        //then — 담기와 캐시가 한 요청으로 끝난다
        em.flush();
        Game cached = gameRepository.findBySourceAndExternalId(GameSource.IGDB, "9767").orElseThrow();
        assertThat(cached.getName()).isEqualTo("Hollow Knight");
        assertThat(cached.getMainExtraHours()).isEqualTo(30);
        assertThat(catalog.detailCalls).containsExactly("9767");
    }

    @Test
    public void 이미_담은_게임을_externalId로_또_담으면_409다() throws Exception {
        //given
        Member member = saveMember();
        catalog.willFind("9767", "Hollow Knight", LocalDate.of(2017, 2, 24));

        mockMvc.perform(post("/api/backlog")
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"externalId\":\"9767\"}"));
        em.flush();

        //when //then — 두 번째는 캐시를 타므로 IGDB 호출은 여전히 1회다
        mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"externalId\":\"9767\"}"))
                .andExpect(status().isConflict());

        assertThat(catalog.detailCalls).containsExactly("9767");
    }

    @Test
    public void IGDB_장애면_백로그도_마스터도_남지_않는다() throws Exception {
        //given — FR-SYS-04 부분 저장 금지
        Member member = saveMember();
        catalog.willFail(new ExternalApiException(ExternalApiException.Service.GAME_CATALOG, "타임아웃"));

        //when
        mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"externalId\":\"9767\"}"))
                .andExpect(status().isBadGateway());

        //then
        em.flush();
        assertThat(gameRepository.findBySourceAndExternalId(GameSource.IGDB, "9767")).isEmpty();
        assertThat(backlogEntryRepository.findAll()).isEmpty();
    }

    @Test
    public void gameId도_externalId도_없으면_400이다() throws Exception {
        //when //then
        mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", saveMember().getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    @Test
    public void 수동_등록은_회원이면_누구나_할_수_있다() throws Exception {
        //given — FR-GAME-04
        Member member = saveMember();

        //when
        mockMvc.perform(post("/api/games")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "동네 오락실 게임",
                                 "developers": ["개인 개발자"],
                                 "releasedOn": "1998-05-01",
                                 "listPrice": {"amount": 5000, "currency": "KRW"}}"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists());

        //then
        em.flush();
        em.clear();
        Game saved = gameRepository.findAll().stream()
                .filter(game -> game.getName().equals("동네 오락실 게임"))
                .findFirst().orElseThrow();
        assertThat(saved.getSource()).isEqualTo(GameSource.MANUAL);
        assertThat(saved.getExternalId()).isNull();
        assertThat(saved.getDevelopers()).containsExactly("개인 개발자");
        assertThat(catalog.searchCalls).isEmpty();
    }

    @Test
    public void 이름이_비면_수동_등록이_400이다() throws Exception {
        //when //then
        mockMvc.perform(post("/api/games")
                        .header("X-Member-Id", saveMember().getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"   \"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 재동기화는_마스터를_갱신하고_표시명을_전파한다() throws Exception {
        //given — FR-GAME-05. 이름이 바뀐 채 IGDB가 새 값을 들고 있다
        Member admin = saveAdmin();
        Member member = saveMember();
        Game game = saveCatalogGame("Holow Knight", "9767");
        addEntry(member, game);

        catalog.willHaveDetail(CatalogGameDetail.basic("9767", "Hollow Knight",
                List.of("Team Cherry"), List.of("Team Cherry"), List.of("Action"),
                LocalDate.of(2017, 2, 24), "cobfzp", 30));

        //when
        mockMvc.perform(post("/api/admin/games/{gameId}/resync", game.getId())
                        .header("X-Member-Id", admin.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nameChanged").value(true))
                .andExpect(jsonPath("$.renamedEntries").value(1))
                .andExpect(jsonPath("$.reorderedEntries").value(1));

        //then
        em.clear();
        Game synced = em.find(Game.class, game.getId());
        assertThat(synced.getName()).isEqualTo("Hollow Knight");
        assertThat(synced.getMainExtraHours()).isEqualTo(30);
        assertThat(synced.getReleasedOn()).isEqualTo(LocalDate.of(2017, 2, 24));
    }

    @Test
    public void 재동기화는_손으로_넣은_정가를_지우지_않는다() throws Exception {
        //given — IGDB는 가격을 안 주므로 전체 교체를 하면 정가가 날아간다 (§6.2)
        Member admin = saveAdmin();
        Game game = saveCatalogGame("Hollow Knight", "9767");

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .put("/api/admin/games/{gameId}", game.getId())
                .header("X-Member-Id", admin.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"listPrice\": {\"amount\": 16500, \"currency\": \"KRW\"}}"));
        em.flush();

        catalog.willFind("9767", "Hollow Knight", LocalDate.of(2017, 2, 24));

        //when
        mockMvc.perform(post("/api/admin/games/{gameId}/resync", game.getId())
                        .header("X-Member-Id", admin.getId()))
                .andExpect(status().isOk());

        //then
        em.clear();
        Game synced = em.find(Game.class, game.getId());
        assertThat(synced.getListPrice()).isNotNull();
        assertThat(synced.getListPrice().getAmount().intValue()).isEqualTo(16500);
    }

    @Test
    public void 수동_등록_게임은_재동기화할_수_없다() throws Exception {
        //given — 원본이 없다
        Member admin = saveAdmin();
        Game game = saveGame("동네 오락실 게임");

        //when //then
        mockMvc.perform(post("/api/admin/games/{gameId}/resync", game.getId())
                        .header("X-Member-Id", admin.getId()))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 일반_회원은_재동기화할_수_없다() throws Exception {
        //given
        Game game = saveCatalogGame("Hollow Knight", "9767");

        //when //then — 인가는 SecurityConfig의 /api/admin/** 규칙이 건다
        mockMvc.perform(post("/api/admin/games/{gameId}/resync", game.getId())
                        .header("X-Member-Id", saveMember().getId()))
                .andExpect(status().isForbidden());
    }

    private Game saveCatalogGame(String name, String externalId) {
        Game game = Game.fromCatalog(name, externalId, LocalDateTime.now());
        gameRepository.persist(game);
        em.flush();
        return game;
    }

    private Member saveAdmin() {
        Member admin = saveMember();
        admin.promoteToAdmin();
        em.flush();
        em.clear();
        return admin;
    }

    private void addEntry(Member member, Game game) throws Exception {
        mockMvc.perform(post("/api/backlog")
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"gameId\":" + game.getId() + "}"));
        em.flush();
    }
}
