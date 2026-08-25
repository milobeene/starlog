package com.milobeene.gamebacklog.backlog.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/**
 * N+1 감시 (L-3, §6.8).
 *
 * **"항목 수가 늘어도 쿼리 수가 안 는다"가 이 파일이 지키는 유일한 명제다.**
 * 3항목과 12항목에서 같은 수가 나오는지만 본다 — 절대값은 조인 구조가 바뀌면 달라져도 되지만,
 * 항목 수에 비례하기 시작하면 그건 언제나 버그다.
 *
 * Hibernate Statistics로 재는 이유 — p6spy 로그를 눈으로 세면 회귀를 못 막는다
 */
class QueryCountTest extends ControllerTestSupport {

    @Autowired EntityManagerFactory emf;

    @Test
    public void 목록_쿼리_수는_항목_수에_비례하지_않는다() throws Exception {
        //given
        Member member = saveMember();
        seedEntries(member, 3);
        long few = countQueries(() -> mockMvc.perform(
                get("/api/backlog").param("size", "20").header("X-Member-Id", member.getId())));

        seedEntries(member, 9);   // 총 12개
        long many = countQueries(() -> mockMvc.perform(
                get("/api/backlog").param("size", "20").header("X-Member-Id", member.getId())));

        //then — 이게 깨지면 어딘가 LAZY가 항목마다 터지고 있다
        assertThat(many)
                .as("3항목 %d방 → 12항목 %d방", few, many)
                .isEqualTo(few);
    }

    @Test
    public void 필터를_걸어도_쿼리_수가_안_늘어난다() throws Exception {
        //given — exists 서브쿼리는 별도 쿼리가 아니라 where 절에 들어간다
        Member member = saveMember();
        seedEntries(member, 5);

        long plain = countQueries(() -> mockMvc.perform(
                get("/api/backlog").header("X-Member-Id", member.getId())));

        long filtered = countQueries(() -> mockMvc.perform(
                get("/api/backlog")
                        .param("q", "game")
                        .param("status", "WISHLIST")
                        .header("X-Member-Id", member.getId())));

        //then
        assertThat(filtered)
                .as("조건 없음 %d방 → 검색+상태 %d방", plain, filtered)
                .isEqualTo(plain);
    }

    @Test
    public void 상세_쿼리_수는_회차_수에_비례하지_않는다() throws Exception {
        //given
        Member member = saveMember();
        Long entryId = addEntry(member, saveGame("Hollow Knight"));
        addPlaythrough(member, entryId, "2026-01-01", "2026-01-05");

        long one = countQueries(() -> mockMvc.perform(
                get("/api/backlog/{id}", entryId).header("X-Member-Id", member.getId())));

        addPlaythrough(member, entryId, "2026-02-01", "2026-02-05");
        addPlaythrough(member, entryId, "2026-03-01", "2026-03-05");

        long three = countQueries(() -> mockMvc.perform(
                get("/api/backlog/{id}", entryId).header("X-Member-Id", member.getId())));

        //then
        assertThat(three)
                .as("회차 1개 %d방 → 3개 %d방", one, three)
                .isEqualTo(one);
    }

    /**
     * 영속성 컨텍스트를 비우고 재는 이유 — 테스트가 @Transactional이라 세팅에서 읽은 엔티티가
     * 1차 캐시에 남아 있다. 그대로 재면 실제보다 적게 나와서 N+1을 못 본다
     */
    private long countQueries(ThrowingRunnable request) throws Exception {
        em.flush();
        em.clear();

        Statistics statistics = emf.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();

        request.run();

        return statistics.getPrepareStatementCount();
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }

    // ── 헬퍼

    private void seedEntries(Member member, int count) throws Exception {
        for (int i = 0; i < count; i++) {
            Long entryId = addEntry(member, saveGame("Game " + System.nanoTime()));
            mockMvc.perform(put("/api/backlog/{id}/genres", entryId)
                    .header("X-Member-Id", member.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"names\":[\"액션\",\"인디\"]}"));
        }
        em.flush();
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

    private Device newDevice(Member member, String label) {
        return new Device(em.getReference(Member.class, member.getId()), label, label, null);
    }

    private void addPlaythrough(Member member, Long entryId, String from, String to) throws Exception {
        Device device = newDevice(member, "기기 " + System.nanoTime());
        em.persist(device);
        em.flush();

        mockMvc.perform(post("/api/backlog/{id}/playthroughs", entryId)
                .header("X-Member-Id", member.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"startedOn\":\"" + from + "\",\"finishedOn\":\"" + to
                        + "\",\"status\":\"COMPLETED\",\"deviceId\":" + device.getId() + "}"));
        em.flush();
    }
}
