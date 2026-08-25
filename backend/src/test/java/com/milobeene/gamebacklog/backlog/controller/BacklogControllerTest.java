package com.milobeene.gamebacklog.backlog.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.milobeene.gamebacklog.backlog.domain.OverrideCommand;
import com.milobeene.gamebacklog.backlog.domain.PlaythroughCommand;
import com.milobeene.gamebacklog.backlog.domain.PlaythroughStatus;
import com.milobeene.gamebacklog.backlog.service.BacklogService;
import com.milobeene.gamebacklog.backlog.service.PlaythroughService;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.support.ControllerTestSupport;
import com.milobeene.gamebacklog.tag.service.GenreService;
import com.milobeene.gamebacklog.tag.service.TagService;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 웹 계층까지 태우는 통합 테스트.
 *
 * 주의 — @Transactional이 요청 전체를 한 트랜잭션으로 감싸기 때문에
 * LazyInitializationException은 여기서 재현되지 않는다.
 * 그건 실제로 앱을 띄워 p6spy 로그로 확인해야 한다 (H-2에서 실제로 한 번 겪었다).
 *
 * Boot 4에서 @AutoConfigureMockMvc의 패키지가 boot.webmvc.test.autoconfigure로 옮겨졌다.
 * 스타터가 모듈별로 쪼개진 것과 같은 개편이다
 */
class BacklogControllerTest extends ControllerTestSupport {

    @Autowired BacklogService backlogService;
    @Autowired PlaythroughService playthroughService;
    @Autowired GenreService genreService;
    @Autowired TagService tagService;

    @Test
    public void 목록은_최근_플레이순이고_회차_없는_항목이_뒤로_간다() throws Exception {
        //given
        Member member = saveMember();
        Long played = addEntry(member, "Hollow Knight");
        Long neverPlayed = addEntry(member, "Stardew Valley");
        addPlaythrough(member, played, LocalDate.of(2024, 3, 1), LocalDate.of(2024, 4, 10));

        //when //then — lastPlayedOn이 null인 항목은 nulls last로 뒤에 온다
        mockMvc.perform(get("/api/backlog").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.items[0].entryId").value(played))
                .andExpect(jsonPath("$.items[1].entryId").value(neverPlayed))
                .andExpect(jsonPath("$.items[1].lastPlaythrough").doesNotExist());
    }

    @Test
    public void 개인_장르가_없으면_카드에_마스터_장르가_나온다() throws Exception {
        //given
        Member member = saveMember();
        Game game = Game.manual("Celeste");
        game.updateMasterInfo(null, null, List.of("Platformer"), null, null);
        gameRepository.persist(game);
        backlogService.addToBacklog(member.getId(), game.getId());

        //when //then
        mockMvc.perform(get("/api/backlog").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].genres[0]").value("Platformer"));
    }

    @Test
    public void 개인_장르가_있으면_마스터를_덮는다() throws Exception {
        //given
        Member member = saveMember();
        Game game = Game.manual("Celeste");
        game.updateMasterInfo(null, null, List.of("Platformer"), null, null);
        gameRepository.persist(game);
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        genreService.replaceGenres(member.getId(), entryId, List.of("플랫포머", "고난이도"));

        //when //then
        mockMvc.perform(get("/api/backlog").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].genres.length()").value(2))
                .andExpect(jsonPath("$.items[0].genres[0]").value("플랫포머"));
    }

    @Test
    public void 상세는_표시값과_마스터_원본을_함께_준다() throws Exception {
        //given
        Member member = saveMember();
        Game game = Game.manual("Ring Fit Adventure");
        gameRepository.persist(game);
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.updateOverrides(member.getId(), entryId,
                new OverrideCommand("링 피트 어드벤처", null, null, null, null));

        //when //then
        mockMvc.perform(get("/api/backlog/{entryId}", entryId).header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.resolved.name").value("링 피트 어드벤처"))
                .andExpect(jsonPath("$.master.name").value("Ring Fit Adventure"))
                .andExpect(jsonPath("$.overrides.name").value("링 피트 어드벤처"))
                .andExpect(jsonPath("$.overrides.developers").isEmpty());   // 빈 배열 = 안 덮어씀
    }

    @Test
    public void 남의_항목을_조회하면_404다() throws Exception {
        //given
        Member owner = saveMember();
        Member stranger = saveMember();
        Long entryId = addEntry(owner, "Outer Wilds");

        //when //then — 403이면 "그 id는 존재한다"가 새어나간다
        mockMvc.perform(get("/api/backlog/{entryId}", entryId).header("X-Member-Id", stranger.getId()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    /** I-3 이후 인증 없는 요청은 401이다. 302 리다이렉트가 아니라 JSON이어야 한다 */
    public void 인증이_없으면_401이다() throws Exception {
        mockMvc.perform(get("/api/backlog"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    public void 지원하지_않는_정렬이면_400이다() throws Exception {
        Member member = saveMember();

        mockMvc.perform(get("/api/backlog").param("sort", "bogus")
                        .header("X-Member-Id", member.getId()))
                .andExpect(status().isBadRequest());
    }

    @Test
    public void facets는_태그별_항목_수를_센다() throws Exception {
        //given — 같은 태그를 두 항목이 공유한다
        Member member = saveMember();
        Long first = addEntry(member, "Hollow Knight");
        Long second = addEntry(member, "Celeste");
        tagService.replaceTags(member.getId(), first, List.of("명작", "메트로배니아"));
        tagService.replaceTags(member.getId(), second, List.of("명작"));

        //when //then
        mockMvc.perform(get("/api/backlog/facets").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tags[?(@.name == '명작')].count").value(2))
                .andExpect(jsonPath("$.tags[?(@.name == '메트로배니아')].count").value(1))
                .andExpect(jsonPath("$.statuses[0].status").value("WISHLIST"))
                .andExpect(jsonPath("$.statuses[0].count").value(2));
    }

    @Test
    public void 삭제된_항목에만_붙은_태그는_facets에서_사라진다() throws Exception {
        //given — 사전 행을 지우는 게 아니라 조회에서 거른다 (§6.7 v1.5 개정)
        Member member = saveMember();
        Long entryId = addEntry(member, "Hollow Knight");
        tagService.replaceTags(member.getId(), entryId, List.of("명작"));

        //when
        backlogService.delete(member.getId(), entryId);

        //then
        mockMvc.perform(get("/api/backlog/facets").header("X-Member-Id", member.getId()))
                .andExpect(jsonPath("$.tags.length()").value(0));
    }


    private Long addEntry(Member member, String gameName) {
        Game game = Game.manual(gameName);
        gameRepository.persist(game);
        return backlogService.addToBacklog(member.getId(), game.getId());
    }

    @Test
    public void 사이드바_이름_목록은_대소문자_무시하고_이름순이다() throws Exception {
        //given
        Member member = saveMember();
        addEntry(member, "Baba Is You");
        addEntry(member, "alba");

        //when //then — 바이너리 정렬이면 'B'(0x42) < 'a'(0x61)라 Baba가 먼저 온다.
        // lower()가 있어야 alba가 앞이다 — 이 순서가 갈리는 데이터여야 변이가 잡힌다
        mockMvc.perform(get("/api/backlog/names").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].displayName").value("alba"))
                .andExpect(jsonPath("$[1].displayName").value("Baba Is You"));
    }

    @Test
    public void 삭제된_항목은_사이드바_이름_목록에서_빠진다() throws Exception {
        //given
        Member member = saveMember();
        addEntry(member, "Hades");
        Long deleted = addEntry(member, "Starfield");
        backlogService.delete(member.getId(), deleted);

        //when //then
        mockMvc.perform(get("/api/backlog/names").header("X-Member-Id", member.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].displayName").value("Hades"))
                .andExpect(jsonPath("$[0].entryId").isNumber());
    }

    private void addPlaythrough(Member member, Long entryId, LocalDate startedOn, LocalDate finishedOn) {
        playthroughService.add(member.getId(), entryId,
                new PlaythroughCommand(startedOn, finishedOn, PlaythroughStatus.COMPLETED,
                        null, null, null, null, null));
    }
}
