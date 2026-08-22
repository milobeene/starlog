package com.milobeene.gamebacklog.tag.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.milobeene.gamebacklog.backlog.service.BacklogService;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.tag.domain.Genre;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class GenreServiceTest {

    @Autowired GenreService genreService;
    @Autowired BacklogService backlogService;
    @Autowired GameRepository gameRepository;
    @Autowired EntityManager em;

    private Long memberId;

    @Test
    public void 개인_장르가_없으면_마스터_장르를_쓴다() {
        //given — 외부 DB가 준 마스터 장르만 있는 상태
        Long entryId = givenEntry("Hollow Knight", List.of("Action", "Platformer"));

        //when & then — §6.7 폴백
        assertThat(genreService.findResolvedGenres(memberId, entryId))
                .containsExactly("Action", "Platformer");
    }

    @Test
    public void 개인_장르가_있으면_마스터를_덮는다() {
        //given
        Long entryId = givenEntry("Hollow Knight", List.of("Action", "Platformer"));

        //when
        genreService.replaceGenres(memberId, entryId, List.of("메트로배니아", "소울라이크"));

        em.flush();
        em.clear();

        //then — 섞이지 않는다. 개인 장르가 1개 이상이면 개인 것만 쓴다
        assertThat(genreService.findResolvedGenres(memberId, entryId))
                .containsExactly("메트로배니아", "소울라이크");
    }

    @Test
    public void 개인_장르를_모두_떼면_마스터로_되돌아간다() {
        //given
        Long entryId = givenEntry("Celeste", List.of("Platformer"));
        genreService.replaceGenres(memberId, entryId, List.of("고인물용"));

        //when
        genreService.replaceGenres(memberId, entryId, List.of());

        em.flush();
        em.clear();

        //then
        assertThat(genreService.findResolvedGenres(memberId, entryId))
                .containsExactly("Platformer");
    }

    @Test
    public void 장르_사전도_태그와_같이_자동_소멸한다() {
        //given
        Long first = givenEntry("Sekiro", List.of());
        Long second = givenEntryForSameMember("Bloodborne", List.of());
        genreService.replaceGenres(memberId, first, List.of("소울라이크"));
        genreService.replaceGenres(memberId, second, List.of("소울라이크"));

        //when — 한쪽만 뗀다
        genreService.replaceGenres(memberId, first, List.of());

        em.flush();
        em.clear();

        //then — 다른 항목이 쓰고 있으므로 남는다
        assertThat(genreService.findDictionary(memberId))
                .extracting(Genre::getName).containsExactly("소울라이크");

        //when — 마지막 하나까지 뗀다
        genreService.replaceGenres(memberId, second, List.of());

        em.flush();
        em.clear();

        //then
        assertThat(genreService.findDictionary(memberId)).isEmpty();
    }

    @Test
    public void 소프트_삭제된_항목만_쓰던_장르는_사전에서_숨는다() {
        //given — 태그와 같은 규칙 (리뷰 D1)
        Long entryId = givenEntry("Firewatch", List.of());
        genreService.replaceGenres(memberId, entryId, List.of("워킹시뮬"));

        //when
        backlogService.delete(memberId, entryId);

        em.flush();
        em.clear();

        //then
        assertThat(genreService.findDictionary(memberId)).isEmpty();
    }

    @Test
    public void 장르를_삭제하면_연결도_사라지고_마스터로_되돌아간다() {
        //given
        Long entryId = givenEntry("Gris", List.of("Adventure"));
        genreService.replaceGenres(memberId, entryId, List.of("감성"));
        Long genreId = genreService.findDictionary(memberId).get(0).getId();

        //when
        genreService.delete(memberId, genreId);

        em.flush();
        em.clear();

        //then
        assertThat(genreService.findResolvedGenres(memberId, entryId))
                .containsExactly("Adventure");
    }

    // ── 헬퍼

    private Long givenEntry(String gameName, List<String> masterGenres) {
        Member member = saveMember("test@example.com");
        memberId = member.getId();
        return givenEntryForSameMember(gameName, masterGenres);
    }

    private Long givenEntryForSameMember(String gameName, List<String> masterGenres) {
        Game game = Game.manual(gameName);
        game.updateMasterInfo(null, null, masterGenres, null, null);
        gameRepository.persist(game);
        return backlogService.addToBacklog(memberId, game.getId());
    }

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        return member;
    }
}
