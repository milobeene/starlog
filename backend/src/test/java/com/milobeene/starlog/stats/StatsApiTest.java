package com.milobeene.starlog.stats;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.platform.domain.Device;
import com.milobeene.starlog.support.ControllerTestSupport;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/** 통계 4종 (L-5, FR-STAT-01~04) */
class StatsApiTest extends ControllerTestSupport {

    // ── FR-STAT-01 장르별 분포

    @Test
    public void 개인_장르가_있으면_개인_장르로_센다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, gameWithMasterGenres("Hollow Knight", "Platform", "Indie"));
        setGenres(member, entryId, "메트로배니아");

        //when //then — 마스터 장르(Platform/Indie)는 세지 않는다 (§6.7)
        mockMvc.perform(get("/api/stats/genres").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].genre").value("메트로배니아"))
                .andExpect(jsonPath("$[0].count").value(1));
    }

    @Test
    public void 개인_장르가_없으면_마스터_장르로_폴백한다() throws Exception {
        //given
        Member member = saveMember();
        addEntry(member, gameWithMasterGenres("Hollow Knight", "Platform", "Indie"));

        //when //then
        mockMvc.perform(get("/api/stats/genres").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    public void 폴백과_개인_장르가_섞여도_각각_한_번씩만_센다() throws Exception {
        //given — 두 집합을 따로 세서 합치는 구조라 중복 집계가 나기 쉬운 자리다
        Member member = saveMember();
        Long personal = addEntry(member, gameWithMasterGenres("Hollow Knight", "Platform"));
        setGenres(member, personal, "메트로배니아");
        addEntry(member, gameWithMasterGenres("Celeste", "Platform"));

        //when //then — Platform은 폴백 항목 1개만, 메트로배니아 1개
        // 정렬은 count 내림차순 → 장르명 오름차순이라 순서가 고정된다
        mockMvc.perform(get("/api/stats/genres").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].genre").value("Platform"))
                .andExpect(jsonPath("$[0].count").value(1))
                .andExpect(jsonPath("$[1].genre").value("메트로배니아"))
                .andExpect(jsonPath("$[1].count").value(1));
    }

    @Test
    public void 삭제된_항목은_장르_통계에서_빠진다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, gameWithMasterGenres("Hollow Knight", "Platform"));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .delete("/api/backlog/{id}", entryId).header("X-Member-Id", member.getId()));
        em.flush();

        //when //then
        mockMvc.perform(get("/api/stats/genres").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    public void 남의_장르는_안_섞인다() throws Exception {
        //given
        Member other = saveMember();
        addEntry(other, gameWithMasterGenres("Hollow Knight", "Platform"));

        //when //then
        mockMvc.perform(get("/api/stats/genres").header("X-Member-Id", saveMember().getId()))
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ── FR-STAT-02 월별 완료 추이

    @Test
    public void 완료는_회차_기준이라_같은_게임을_두_번_깨면_2다() throws Exception {
        //given — 항목 상태로 세면 1이 된다. 그러면 "올해 몇 번 끝냈나"가 틀린다
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Hollow Knight"));
        completePlaythrough(member, entryId, "2026-03-01", "2026-03-10");
        completePlaythrough(member, entryId, "2026-03-20", "2026-03-25");

        //when //then
        mockMvc.perform(get("/api/stats/completions/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.months.length()").value(1))
                .andExpect(jsonPath("$.months[0].period").value("2026-03"))
                .andExpect(jsonPath("$.months[0].count").value(2));
    }

    @Test
    public void 같은_달에_깬_게임_이름이_함께_온다() throws Exception {
        //given — 차트의 툴팁이 "그 달에 뭘 깼나"를 보여준다
        Member member = saveMember();
        completePlaythrough(member, addEntry(member, saveGame("Hollow Knight")), "2026-03-01", "2026-03-10");
        completePlaythrough(member, addEntry(member, saveGame("Celeste")), "2026-03-05", "2026-03-08");

        //when //then — 이름은 정렬된다. 안 그러면 새로고침마다 순서가 흔들린다
        mockMvc.perform(get("/api/stats/completions/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.months[0].items.length()").value(2))
                .andExpect(jsonPath("$.months[0].items[0]").value("Celeste"))
                .andExpect(jsonPath("$.months[0].items[1]").value("Hollow Knight"));
    }

    @Test
    public void 연합계는_그_해에_깬_횟수다() throws Exception {
        //given — 지출은 연평균이지만 완료는 합계다. "올해 몇 개 깼나"가 자연스럽다
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Hollow Knight"));
        completePlaythrough(member, entryId, "2026-01-01", "2026-01-10");
        completePlaythrough(member, entryId, "2026-05-01", "2026-05-10");

        //when //then
        mockMvc.perform(get("/api/stats/completions/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.months.length()").value(2))
                .andExpect(jsonPath("$.years.length()").value(1))
                .andExpect(jsonPath("$.years[0].year").value(2026))
                .andExpect(jsonPath("$.years[0].count").value(2));
    }

    @Test
    public void 진행_중_회차는_완료로_안_센다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Hollow Knight"));
        startPlaythrough(member, entryId, "2026-01-01");

        //when //then
        mockMvc.perform(get("/api/stats/completions/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.months.length()").value(0))
                .andExpect(jsonPath("$.years.length()").value(0));
    }

    // ── FR-STAT-03 플레이 시간

    @Test
    public void 총합과_순위를_같이_준다() throws Exception {
        //given
        Member member = saveMember();
        setPlaytime(member, addEntry(member, saveGame("Long Game")), 100);
        setPlaytime(member, addEntry(member, saveGame("Short Game")), 5);
        addEntry(member, saveGame("Unrecorded"));   // 기록 없음

        //when //then — 분모(recordedEntries)를 밝혀야 "총 105시간"이 오해되지 않는다
        mockMvc.perform(get("/api/stats/playtime").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalHours").value(105))
                .andExpect(jsonPath("$.recordedEntries").value(2))
                .andExpect(jsonPath("$.top[0].displayName").value("Long Game"))
                .andExpect(jsonPath("$.top[1].displayName").value("Short Game"));
    }

    @Test
    public void 기록이_하나도_없으면_0이다() throws Exception {
        //given — sum()이 null을 돌려주는 자리다. 그대로 내리면 NPE거나 null이 나간다
        Member member = saveMember();
        addEntry(member, saveGame("Unrecorded"));

        //when //then
        mockMvc.perform(get("/api/stats/playtime").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.totalHours").value(0))
                .andExpect(jsonPath("$.recordedEntries").value(0))
                .andExpect(jsonPath("$.top.length()").value(0));
    }

    @Test
    public void limit을_넘겨도_상한을_넘지_않는다() throws Exception {
        //given — 서버는 클라이언트를 믿지 않는다
        Member member = saveMember();
        for (int i = 0; i < 3; i++) {
            setPlaytime(member, addEntry(member, saveGame("Game " + i)), 10 + i);
        }

        //when //then
        mockMvc.perform(get("/api/stats/playtime").param("limit", "100000")
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.top.length()").value(3));
    }

    // ── FR-STAT-04 지출

    @Test
    public void 구매와_구독을_합치지_않는다() throws Exception {
        //given — BR-ACQ-01. 구독료를 개별 게임에 배분하지 않는다
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Hollow Knight"));
        addPurchase(member, entryId, "16500", "KRW");
        addSubscription(member, "Game Pass", "16700", "KRW", "MONTHLY", "2026-01-01", "2026-03-31");

        //when //then — 월간 3개월치 = 50100
        mockMvc.perform(get("/api/stats/spending").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.purchases[0].currency").value("KRW"))
                .andExpect(jsonPath("$.purchases[0].total").value(16500))
                .andExpect(jsonPath("$.subscriptions[0].total").value(50100));
    }

    @Test
    public void 통화가_다르면_따로_집계한다() throws Exception {
        //given — 환산에는 환율이 필요하고 범위 밖이다. 더해버리면 조용히 틀린 숫자가 된다
        Member member = saveMember();
        Long a = addEntry(member, saveGame("A"));
        Long b = addEntry(member, saveGame("B"));
        addPurchase(member, a, "16500", "KRW");
        addPurchase(member, b, "19.99", "USD");

        //when //then
        // 통화 오름차순이라 KRW → USD 순이다
        mockMvc.perform(get("/api/stats/spending").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.purchases.length()").value(2))
                .andExpect(jsonPath("$.purchases[0].currency").value("KRW"))
                .andExpect(jsonPath("$.purchases[0].total").value(16500.00))
                .andExpect(jsonPath("$.purchases[1].currency").value("USD"))
                .andExpect(jsonPath("$.purchases[1].total").value(19.99));
    }

    @Test
    public void 종료일이_없는_구독은_오늘까지_센다() throws Exception {
        //given — 구독 중이면 endedOn이 null이다
        Member member = saveMember();
        addSubscription(member, "PS Plus", "10000", "KRW", "MONTHLY", "2026-08-01", null);

        //when //then — 최소 1회분은 잡혀야 한다
        mockMvc.perform(get("/api/stats/spending").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subscriptions.length()").value(1));
    }

    @Test
    public void 지출이_없으면_빈_배열이다() throws Exception {
        //when //then — null이 아니라 빈 배열이어야 화면이 분기를 안 한다
        mockMvc.perform(get("/api/stats/spending").header("X-Member-Id", saveMember().getId()))
                .andExpect(jsonPath("$.purchases.length()").value(0))
                .andExpect(jsonPath("$.subscriptions.length()").value(0));
    }

    // ── FR-STAT-07 월별 지출

    @Test
    public void 취득은_취득일이_속한_달에_꽂힌다() throws Exception {
        //given
        Member member = saveMember();
        Long a = addEntry(member, saveGame("A"));
        Long b = addEntry(member, saveGame("B"));
        addPurchaseOn(member, a, "16500", "KRW", "2026-01-15");
        addPurchaseOn(member, b, "20000", "KRW", "2026-03-02");

        //when //then
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currencies[0]").value("KRW"))
                .andExpect(jsonPath("$.months.length()").value(2))
                .andExpect(jsonPath("$.months[0].period").value("2026-01"))
                .andExpect(jsonPath("$.months[0].amounts.KRW").value(16500))
                .andExpect(jsonPath("$.months[1].period").value("2026-03"))
                .andExpect(jsonPath("$.months[1].amounts.KRW").value(20000));
    }

    @Test
    public void 월별_지출에_그_달에_산_게임_이름이_함께_온다() throws Exception {
        //given — 금액만 있으면 "이 달에 왜 이만큼 썼지"에 답이 안 된다
        Member member = saveMember();
        Long a = addEntry(member, saveGame("Celeste"));
        Long b = addEntry(member, saveGame("Hades"));
        addPurchaseOn(member, a, "16500", "KRW", "2026-01-15");
        addPurchaseOn(member, b, "20000", "KRW", "2026-01-20");

        //when //then — 이름순이라 순서가 흔들리지 않는다
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.months[0].items.length()").value(2))
                .andExpect(jsonPath("$.months[0].items[0]").value("Celeste"))
                .andExpect(jsonPath("$.months[0].items[1]").value("Hades"));
    }

    @Test
    public void 같은_달에_같은_항목을_두_번_사도_이름은_한_번만_나온다() throws Exception {
        //given — 본편 + DLC처럼 취득이 둘이어도 이름이 겹쳐 보이면 고장으로 읽힌다
        Member member = saveMember();
        Long entry = addEntry(member, saveGame("Celeste"));
        addPurchaseOn(member, entry, "16500", "KRW", "2026-02-01");
        addPurchaseOn(member, entry, "5000", "KRW", "2026-02-10");

        //when //then — 금액은 합쳐지고 이름은 하나다
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.months[0].amounts.KRW").value(21500))
                .andExpect(jsonPath("$.months[0].items.length()").value(1))
                .andExpect(jsonPath("$.months[0].items[0]").value("Celeste"));
    }

    @Test
    public void 구독이_게임보다_앞에_오고_구독_표시가_붙는다() throws Exception {
        //given — 구독은 매달 고정으로 깔리는 바닥이라 먼저 읽혀야 나머지가 변동분으로 보인다
        Member member = saveMember();
        Long entry = addEntry(member, saveGame("Celeste"));
        addPurchaseOn(member, entry, "16500", "KRW", "2026-01-15");
        addSubscription(member, "PS Plus", "10000", "KRW", "MONTHLY", "2026-01-01", "2026-01-31");

        //when //then
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.months[0].items[0]").value("PS Plus(구독)"))
                .andExpect(jsonPath("$.months[0].items[1]").value("Celeste"));
    }

    @Test
    public void 같은_달_취득은_합산된다() throws Exception {
        //given
        Member member = saveMember();
        Long a = addEntry(member, saveGame("A"));
        Long b = addEntry(member, saveGame("B"));
        addPurchaseOn(member, a, "10000", "KRW", "2026-01-05");
        addPurchaseOn(member, b, "5000", "KRW", "2026-01-20");

        //when //then
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.months.length()").value(1))
                .andExpect(jsonPath("$.months[0].amounts.KRW").value(15000));
    }

    @Test
    public void 통화가_섞이면_선이_두_개다() throws Exception {
        //given — 환산하지 않으므로 통화마다 선이 하나씩이다
        Member member = saveMember();
        Long a = addEntry(member, saveGame("A"));
        Long b = addEntry(member, saveGame("B"));
        addPurchaseOn(member, a, "16500", "KRW", "2026-02-01");
        addPurchaseOn(member, b, "19.99", "USD", "2026-02-10");

        //when //then
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.currencies.length()").value(2))
                .andExpect(jsonPath("$.months.length()").value(1))
                .andExpect(jsonPath("$.months[0].amounts.KRW").value(16500))
                .andExpect(jsonPath("$.months[0].amounts.USD").value(19.99));
    }

    @Test
    public void 월간_구독은_기간_전체에_펼쳐진다() throws Exception {
        //given — 구독은 날짜가 없어 기간을 월별로 펼쳐야 한다
        Member member = saveMember();
        addSubscription(member, "Game Pass", "16700", "KRW", "MONTHLY", "2026-01-01", "2026-03-31");

        //when //then — 1·2·3월 각각 16700
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.months.length()").value(3))
                .andExpect(jsonPath("$.months[0].period").value("2026-01"))
                .andExpect(jsonPath("$.months[0].amounts.KRW").value(16700))
                .andExpect(jsonPath("$.months[2].period").value("2026-03"))
                .andExpect(jsonPath("$.months[2].amounts.KRW").value(16700));
    }

    @Test
    public void 연간_구독은_결제한_달에만_꽂힌다() throws Exception {
        //given — 12로 나눠 흩뿌리면 "그 달에 실제로 나간 돈"이 아니게 된다
        Member member = saveMember();
        addSubscription(member, "PS Plus", "120000", "KRW", "YEARLY", "2025-01-01", "2026-06-30");

        //when //then — 2025-01, 2026-01 두 번
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.months.length()").value(2))
                .andExpect(jsonPath("$.months[0].period").value("2025-01"))
                .andExpect(jsonPath("$.months[1].period").value("2026-01"))
                .andExpect(jsonPath("$.months[1].amounts.KRW").value(120000));
    }

    @Test
    public void 해를_넘긴_연간_구독의_결제_횟수는_시작월_기준이다() throws Exception {
        //given — 12월 시작 연간 구독. 달력 연도로 세면 결제 1번이 2번으로 부풀려진다
        Member member = saveMember();
        addSubscription(member, "PS Plus", "120000", "KRW", "YEARLY", "2025-12-01", "2026-08-31");

        //when //then — 월별 추이(2025-12 한 번)와 같은 횟수여야 두 통계가 맞는다
        mockMvc.perform(get("/api/stats/spending").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.subscriptions[0].total").value(120000));
    }

    @Test
    public void 취득과_구독이_같은_달이면_합쳐진다() throws Exception {
        //given — 꺾은선은 "그 달에 쓴 돈" 하나다. 두 축 분리는 /spending이 한다
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("A"));
        addPurchaseOn(member, entryId, "10000", "KRW", "2026-01-15");
        addSubscription(member, "Game Pass", "16700", "KRW", "MONTHLY", "2026-01-01", "2026-01-31");

        //when //then
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.months.length()").value(1))
                .andExpect(jsonPath("$.months[0].amounts.KRW").value(26700));
    }

    @Test
    public void 연도별_월평균의_분모는_12개월_고정이다() throws Exception {
        //given — 1월에 120000 하나뿐. 데이터 있는 달만으로 나누면 120000이 된다
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("A"));
        addPurchaseOn(member, entryId, "120000", "KRW", "2026-01-15");

        //when //then — 120000 / 12 = 10000
        mockMvc.perform(get("/api/stats/spending/monthly").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.yearlyAverages.length()").value(1))
                .andExpect(jsonPath("$.yearlyAverages[0].year").value(2026))
                .andExpect(jsonPath("$.yearlyAverages[0].amounts.KRW").value(10000.00));
    }

    @Test
    public void 지출이_없으면_빈_결과다() throws Exception {
        //when //then
        mockMvc.perform(get("/api/stats/spending/monthly")
                        .header("X-Member-Id", saveMember().getId()))
                .andExpect(jsonPath("$.currencies.length()").value(0))
                .andExpect(jsonPath("$.months.length()").value(0))
                .andExpect(jsonPath("$.yearlyAverages.length()").value(0));
    }

    // ── 헬퍼

    private Game gameWithMasterGenres(String name, String... genres) {
        Game game = Game.fromCatalog(name, String.valueOf(System.nanoTime()), LocalDateTime.now());
        game.syncFromCatalog(com.milobeene.starlog.game.domain.CatalogSyncCommand.of(
                List.of(), List.of(), List.of(genres), null), LocalDateTime.now());
        gameRepository.persist(game);
        em.flush();
        return game;
    }

    private Long addEntry(Member member, Game game) throws Exception {
        String body = mockMvc.perform(post("/api/backlog")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"gameId\":" + game.getId() + "}"))
                .andReturn().getResponse().getContentAsString();
        em.flush();
        return Long.valueOf(body.replaceAll("\\D+", ""));
    }

    private void setGenres(Member member, Long entryId, String... names) throws Exception {
        String json = String.join("\",\"", names);
        mockMvc.perform(put("/api/backlog/{id}/genres", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"names\":[\"" + json + "\"]}"))
                .andExpect(status().isOk());
        em.flush();
    }

    private void setPlaytime(Member member, Long entryId, int hours) throws Exception {
        mockMvc.perform(put("/api/backlog/{id}/personal-record", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"playTimeHours\":" + hours + "}"))
                .andExpect(status().isOk());
        em.flush();
    }

    private void completePlaythrough(Member member, Long entryId, String from, String to)
            throws Exception {
        Device device = new Device(em.getReference(Member.class, member.getId()),
                "기기", "기기 " + System.nanoTime(), null);
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

    private void startPlaythrough(Member member, Long entryId, String from) throws Exception {
        Device device = new Device(em.getReference(Member.class, member.getId()),
                "기기", "기기 " + System.nanoTime(), null);
        em.persist(device);
        em.flush();

        mockMvc.perform(post("/api/backlog/{id}/playthroughs", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"startedOn\":\"" + from
                                + "\",\"status\":\"PLAYING\",\"deviceId\":" + device.getId() + "}"))
                .andExpect(status().isCreated());
        em.flush();
    }

    private void addPurchaseOn(Member member, Long entryId, String amount, String currency,
                               String acquiredOn) throws Exception {
        mockMvc.perform(post("/api/backlog/{id}/acquisitions", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"method\":\"PURCHASED\",\"acquiredOn\":\"" + acquiredOn + "\","
                                + "\"price\":{\"amount\":" + amount + ",\"currency\":\"" + currency + "\"}}"))
                .andExpect(status().isCreated());
        em.flush();
    }

    private void addPurchase(Member member, Long entryId, String amount, String currency)
            throws Exception {
        mockMvc.perform(post("/api/backlog/{id}/acquisitions", entryId)
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"method\":\"PURCHASED\",\"acquiredOn\":\"2026-01-01\","
                                + "\"price\":{\"amount\":" + amount + ",\"currency\":\"" + currency + "\"}}"))
                .andExpect(status().isCreated());
        em.flush();
    }

    private void addSubscription(Member member, String name, String fee, String currency,
                                 String cycle, String from, String to) throws Exception {
        String endedOn = (to == null) ? "null" : "\"" + to + "\"";
        mockMvc.perform(post("/api/me/subscriptions")
                        .header("X-Member-Id", member.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"serviceName\":\"" + name + "\",\"startedOn\":\"" + from
                                + "\",\"endedOn\":" + endedOn
                                + ",\"billingCycle\":\"" + cycle + "\","
                                + "\"fee\":{\"amount\":" + fee + ",\"currency\":\"" + currency + "\"}}"))
                .andExpect(status().isCreated());
        em.flush();
    }
}
