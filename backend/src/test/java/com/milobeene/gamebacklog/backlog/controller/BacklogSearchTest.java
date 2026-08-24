package com.milobeene.gamebacklog.backlog.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.member.domain.Member;
import static org.assertj.core.api.Assertions.assertThat;
import com.milobeene.gamebacklog.platform.domain.Platform;
import com.milobeene.gamebacklog.platform.domain.PlatformAccount;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** 목록 검색·필터·정렬 (L-1, L-2 / FR-QRY-02~04) */
class BacklogSearchTest extends ControllerTestSupport {

    @Test
    public void 이름으로_검색한다() throws Exception {
        //given
        Member member = saveMember();
        addEntry(member, saveGame("Hollow Knight"));
        addEntry(member, saveGame("Celeste"));

        //when //then — 대상은 displayName이다 (§6.8)
        mockMvc.perform(get("/api/backlog").param("q", "knight")
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].displayName").value("Hollow Knight"));
    }

    @Test
    public void 검색은_대소문자를_가리지_않는다() throws Exception {
        //given
        Member member = saveMember();
        addEntry(member, saveGame("Hollow Knight"));

        //when //then
        mockMvc.perform(get("/api/backlog").param("q", "HOLLOW")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    public void 오버라이드한_한글_이름으로도_검색된다() throws Exception {
        //given — displayName이 검색 대상이라 오버라이드가 곧 검색어가 된다 (§6.8)
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Hollow Knight"));

        mockMvc.perform(put("/api/backlog/{id}/overrides", entryId)
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"할로우 나이트\"}"));
        em.flush();

        //when //then
        mockMvc.perform(get("/api/backlog").param("q", "나이트")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    public void 상태로_필터링하고_복수_선택이_된다() throws Exception {
        //given
        Member member = saveMember();
        Long playing = addEntry(member, saveGame("Hollow Knight"));
        addEntry(member, saveGame("Celeste"));           // WISHLIST
        startPlaythrough(member, playing);

        //when //then — ?status=PLAYING&status=WISHLIST
        mockMvc.perform(get("/api/backlog")
                        .param("status", "PLAYING")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(get("/api/backlog")
                        .param("status", "PLAYING", "WISHLIST")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    public void 없는_상태값은_400이다() throws Exception {
        //when //then — 스프링이 enum 변환에서 막고 전역 핸들러가 400으로 바꾼다
        mockMvc.perform(get("/api/backlog").param("status", "BOGUS")
                        .header("X-Member-Id", saveMember().getId()))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void 태그로_필터링한다() throws Exception {
        //given
        Member member = saveMember();
        Long tagged = addEntry(member, saveGame("Hollow Knight"));
        addEntry(member, saveGame("Celeste"));

        mockMvc.perform(put("/api/backlog/{id}/tags", tagged)
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"names\":[\"명작\"]}"));
        em.flush();

        Long tagId = tagIdOf(member, "명작");

        //when //then
        mockMvc.perform(get("/api/backlog").param("tagId", String.valueOf(tagId))
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].entryId").value(tagged));
    }

    @Test
    public void 태그가_여러_개_붙어도_행이_중복되지_않는다() throws Exception {
        //given — join으로 짰다면 태그 수만큼 같은 항목이 반복된다. exists라 안 늘어난다
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Hollow Knight"));

        mockMvc.perform(put("/api/backlog/{id}/tags", entryId)
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"names\":[\"명작\",\"메트로배니아\",\"인디\"]}"));
        em.flush();

        Long tagId = tagIdOf(member, "명작");

        //when //then
        mockMvc.perform(get("/api/backlog").param("tagId", String.valueOf(tagId))
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test
    public void 기기로_필터링한다() throws Exception {
        //given — 기기는 회차 기준이다
        Member member = saveMember();
        Long played = addEntry(member, saveGame("Hollow Knight"));
        addEntry(member, saveGame("Celeste"));
        Long deviceId = startPlaythrough(member, played);

        //when //then
        mockMvc.perform(get("/api/backlog").param("deviceId", String.valueOf(deviceId))
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].entryId").value(played));
    }

    @Test
    public void 조건을_겹쳐도_AND로_좁혀진다() throws Exception {
        //given
        Member member = saveMember();
        Long target = addEntry(member, saveGame("Hollow Knight"));
        addEntry(member, saveGame("Hollow World"));
        startPlaythrough(member, target);

        //when //then — 이름은 둘 다 걸리지만 상태는 하나만
        mockMvc.perform(get("/api/backlog")
                        .param("q", "hollow")
                        .param("status", "PLAYING")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].entryId").value(target));
    }

    @Test
    public void 조건이_없으면_전부_나온다() throws Exception {
        //given
        Member member = saveMember();
        addEntry(member, saveGame("Hollow Knight"));
        addEntry(member, saveGame("Celeste"));

        //when //then — null 조건은 QueryDSL이 무시한다
        mockMvc.perform(get("/api/backlog").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    public void 남의_항목은_어떤_조건으로도_안_보인다() throws Exception {
        //given
        Member other = saveMember();
        addEntry(other, saveGame("Hollow Knight"));

        //when //then
        mockMvc.perform(get("/api/backlog").param("q", "hollow")
                        .header("X-Member-Id", saveMember().getId()))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    public void 이름순_정렬이_유지된다() throws Exception {
        //given — L-2가 QueryDSL로 옮겨져도 안 깨지는지
        Member member = saveMember();
        addEntry(member, saveGame("Celeste"));
        addEntry(member, saveGame("Alba"));
        addEntry(member, saveGame("Baba Is You"));

        //when //then
        mockMvc.perform(get("/api/backlog").param("sort", "name")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.items[0].displayName").value("Alba"))
                .andExpect(jsonPath("$.items[1].displayName").value("Baba Is You"))
                .andExpect(jsonPath("$.items[2].displayName").value("Celeste"));
    }

    @Test
    public void 필터를_걸어도_페이징이_맞는다() throws Exception {
        //given
        Member member = saveMember();
        for (int i = 0; i < 5; i++) {
            addEntry(member, saveGame("Hollow " + i));
        }
        addEntry(member, saveGame("Celeste"));

        //when //then — count 쿼리도 같은 조건을 타야 totalElements가 맞는다
        mockMvc.perform(get("/api/backlog")
                        .param("q", "hollow").param("size", "2").param("page", "1")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(5))
                .andExpect(jsonPath("$.totalPages").value(3))
                .andExpect(jsonPath("$.items.length()").value(2));
    }

    @Test
    public void 최다_플레이순_정렬이_된다() throws Exception {
        //given — 대시보드 "최다 플레이" 타일용 (v1.7 신설)
        Member member = saveMember();
        setPlaytime(member, addEntry(member, saveGame("Short")), 5);
        setPlaytime(member, addEntry(member, saveGame("Long")), 100);
        setPlaytime(member, addEntry(member, saveGame("Medium")), 40);

        //when //then
        mockMvc.perform(get("/api/backlog").param("sort", "playtime")
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].displayName").value("Long"))
                .andExpect(jsonPath("$.items[1].displayName").value("Medium"))
                .andExpect(jsonPath("$.items[2].displayName").value("Short"));
    }

    @Test
    public void 플레이시간_기록이_없는_항목은_뒤로_밀린다() throws Exception {
        //given — nullsLast가 없으면 DB마다 순서가 갈린다 (H2는 가장 작게, PostgreSQL은 가장 크게)
        Member member = saveMember();
        addEntry(member, saveGame("Unrecorded"));
        setPlaytime(member, addEntry(member, saveGame("Recorded")), 10);

        //when //then
        mockMvc.perform(get("/api/backlog").param("sort", "playtime")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.items[0].displayName").value("Recorded"))
                .andExpect(jsonPath("$.items[1].displayName").value("Unrecorded"));
    }

    @Test
    public void 대시보드_타일은_size로_잘라_쓴다() throws Exception {
        //given — "최근 플레이 5개" 같은 타일은 전용 API가 아니라 목록 API를 자른다
        Member member = saveMember();
        for (int i = 0; i < 7; i++) {
            setPlaytime(member, addEntry(member, saveGame("Game " + i)), i + 1);
        }

        //when //then — "더 보기"는 같은 sort로 size만 늘리면 된다
        mockMvc.perform(get("/api/backlog").param("sort", "playtime").param("size", "5")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.totalElements").value(7));
    }

    private void setPlaytime(Member member, Long entryId, int hours) throws Exception {
        mockMvc.perform(put("/api/backlog/{id}/personal-record", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playTimeHours\":" + hours + "}"))
                .andExpect(status().isOk());
        em.flush();
    }

    // ── FR-QRY-03 나머지 필터 축 (감사에서 genreId·platformAccountId 0건으로 드러남)

    @Test
    public void 장르로_필터링한다() throws Exception {
        //given
        Member member = saveMember();
        Long tagged = addEntry(member, saveGame("Hollow Knight"));
        addEntry(member, saveGame("Celeste"));

        mockMvc.perform(put("/api/backlog/{id}/genres", tagged)
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"names\":[\"메트로배니아\"]}"));
        em.flush();

        Long genreId = genreIdOf(member, "메트로배니아");

        //when //then
        mockMvc.perform(get("/api/backlog").param("genreId", String.valueOf(genreId))
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].entryId").value(tagged));
    }

    @Test
    public void 플랫폼_계정으로_필터링한다() throws Exception {
        //given — 계정 필터는 **취득** 기준이다 (facets 카운트와 같은 뜻, API 설계서 §1.2)
        Member member = saveMember();
        Long owned = addEntry(member, saveGame("Hollow Knight"));
        addEntry(member, saveGame("Celeste"));

        Platform steam = Platform.of("Steam " + System.nanoTime());
        em.persist(steam);
        PlatformAccount account = new PlatformAccount(
                em.find(Member.class, member.getId()), steam, "본계정");
        em.persist(account);
        em.flush();

        mockMvc.perform(post("/api/backlog/{id}/acquisitions", owned)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"method\":\"PURCHASED\",\"acquiredOn\":\"2026-01-01\",\"platformId\":"
                                + steam.getId() + ",\"platformAccountId\":" + account.getId() + "}"))
                .andExpect(status().isCreated());
        em.flush();

        //when //then
        mockMvc.perform(get("/api/backlog").param("platformAccountId", String.valueOf(account.getId()))
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].entryId").value(owned));
    }

    // ── FR-QRY-04 나머지 정렬 축 + BR-QRY-01 (감사에서 rating·releasedOn·동점 0건으로 드러남)

    @Test
    public void 평점순_정렬이_된다() throws Exception {
        //given
        Member member = saveMember();
        setRating(member, addEntry(member, saveGame("Mid")), "70.0");
        setRating(member, addEntry(member, saveGame("Best")), "95.5");
        setRating(member, addEntry(member, saveGame("Worst")), "40.0");

        //when //then
        mockMvc.perform(get("/api/backlog").param("sort", "rating")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.items[0].displayName").value("Best"))
                .andExpect(jsonPath("$.items[2].displayName").value("Worst"));
    }

    @Test
    public void 평점이_없는_항목은_뒤로_밀린다() throws Exception {
        //given — nullsLast가 없으면 DB마다 순서가 갈린다 (H2는 가장 작게, PostgreSQL은 가장 크게)
        Member member = saveMember();
        addEntry(member, saveGame("Unrated"));
        setRating(member, addEntry(member, saveGame("Rated")), "50.0");

        //when //then
        mockMvc.perform(get("/api/backlog").param("sort", "rating")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.items[0].displayName").value("Rated"))
                .andExpect(jsonPath("$.items[1].displayName").value("Unrated"));
    }

    @Test
    public void 출시일순_정렬은_오버라이드를_반영한다() throws Exception {
        //given — 정렬 대상은 releasedOnResolved 비정규화 컬럼이다 (§7.2)
        Member member = saveMember();
        Long old = addEntry(member, gameReleasedOn("Old Game", "2010-01-01"));
        Long recent = addEntry(member, gameReleasedOn("Recent Game", "2020-01-01"));

        //when — old의 출시일을 오버라이드로 2030년으로 덮으면 순서가 뒤집혀야 한다
        mockMvc.perform(put("/api/backlog/{id}/overrides", old)
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"releasedOn\":\"2030-01-01\"}"));
        em.flush();

        //then
        mockMvc.perform(get("/api/backlog").param("sort", "releasedOn")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.items[0].entryId").value(old))
                .andExpect(jsonPath("$.items[1].entryId").value(recent));
    }

    @Test
    public void 평점이_같으면_최근_플레이순으로_갈린다() throws Exception {
        /*
         * given — BR-QRY-01. **2차 정렬이 없으면 순서가 매 요청 흔들려 페이징이 깨진다**는 게
         * 규칙의 근거인데, 감사 전까지 1차 키가 동점인 데이터가 테스트에 하나도 없었다.
         * BacklogSort.SECONDARY를 지워도 전부 통과하던 상태였다
         */
        Member member = saveMember();
        Long older = addEntry(member, saveGame("Older"));
        Long newer = addEntry(member, saveGame("Newer"));
        setRating(member, older, "90.0");
        setRating(member, newer, "90.0");
        completePlaythrough(member, older, "2026-01-01", "2026-01-05");
        completePlaythrough(member, newer, "2026-06-01", "2026-06-05");

        //when //then — 평점이 같으니 최근 플레이가 앞
        mockMvc.perform(get("/api/backlog").param("sort", "rating")
                        .header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.items[0].entryId").value(newer))
                .andExpect(jsonPath("$.items[1].entryId").value(older));
    }

    @Test
    public void 전부_동점이어도_페이징에_같은_행이_두_번_안_나온다() throws Exception {
        //given — 평점도 lastPlayedOn도 전부 null. TIE_BREAK(id desc)만이 순서를 정한다
        Member member = saveMember();
        for (int i = 0; i < 6; i++) {
            addEntry(member, saveGame("Same " + i));
        }

        //when
        java.util.Set<Integer> seen = new java.util.HashSet<>();
        for (int page = 0; page < 3; page++) {
            String body = mockMvc.perform(get("/api/backlog")
                            .param("sort", "rating").param("size", "2")
                            .param("page", String.valueOf(page))
                            .header("X-Member-Id", member.getId()))
                    .andReturn().getResponse().getContentAsString();
            java.util.regex.Matcher m =
                    java.util.regex.Pattern.compile("\"entryId\":(\\d+)").matcher(body);
            while (m.find()) {
                //then — 같은 행이 두 페이지에 나오면 여기서 걸린다
                assertThat(seen.add(Integer.valueOf(m.group(1))))
                        .as("entryId %s 가 두 번 나왔다", m.group(1)).isTrue();
            }
        }
        assertThat(seen).hasSize(6);
    }

    // ── 헬퍼

    private Long addEntry(Member member, Game game) throws Exception {
        String body = mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"gameId\":" + game.getId() + "}"))
                .andReturn().getResponse().getContentAsString();
        em.flush();
        return Long.valueOf(body.replaceAll("\\D+", ""));
    }

    /** 진행 중 회차를 붙여 상태를 PLAYING으로 만든다. 반환은 기기 id */
    private Long startPlaythrough(Member member, Long entryId) throws Exception {
        Device device = Device.of("Nintendo Switch");
        em.persist(device);
        em.flush();

        mockMvc.perform(post("/api/backlog/{id}/playthroughs", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"startedOn\":\"2026-01-01\",\"status\":\"PLAYING\",\"deviceId\":"
                                + device.getId() + "}"))
                .andExpect(status().isCreated());
        em.flush();
        return device.getId();
    }

    private void setRating(Member member, Long entryId, String rating) throws Exception {
        mockMvc.perform(put("/api/backlog/{id}/personal-record", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":" + rating + "}"))
                .andExpect(status().isOk());
        em.flush();
    }

    private Game gameReleasedOn(String name, String releasedOn) {
        Game game = Game.manual(name);
        game.updateMasterInfo(java.util.List.of(), java.util.List.of(), java.util.List.of(),
                java.time.LocalDate.parse(releasedOn), null);
        gameRepository.persist(game);
        em.flush();
        return game;
    }

    private void completePlaythrough(Member member, Long entryId, String from, String to)
            throws Exception {
        Device device = Device.of("기기 " + System.nanoTime());
        em.persist(device);
        em.flush();
        mockMvc.perform(post("/api/backlog/{id}/playthroughs", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"startedOn\":\"" + from + "\",\"finishedOn\":\"" + to
                                + "\",\"status\":\"COMPLETED\",\"deviceId\":" + device.getId() + "}"))
                .andExpect(status().isCreated());
        em.flush();
    }

    private Long genreIdOf(Member member, String name) {
        return em.createQuery(
                        "select g.id from Genre g where g.member.id = :memberId and g.name = :name",
                        Long.class)
                .setParameter("memberId", member.getId())
                .setParameter("name", name)
                .getSingleResult();
    }

    private Long tagIdOf(Member member, String name) {
        return em.createQuery(
                        "select t.id from Tag t where t.member.id = :memberId and t.name = :name",
                        Long.class)
                .setParameter("memberId", member.getId())
                .setParameter("name", name)
                .getSingleResult();
    }
}
