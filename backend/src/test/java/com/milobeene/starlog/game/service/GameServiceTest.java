package com.milobeene.starlog.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.OverrideCommand;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class GameServiceTest {

    @Autowired GameService gameService;
    @Autowired BacklogService backlogService;
    @Autowired GameRepository gameRepository;
    @Autowired BacklogEntryRepository backlogEntryRepository;
    @Autowired EntityManager em;

    @Test
    public void 마스터_이름을_바꾸면_전_회원의_표시명이_갱신된다() {
        //given — 두 회원이 같은 게임을 담았다
        Member me = saveMember("me@example.com");
        Member other = saveMember("other@example.com");
        Game game = saveGame("Dark Souls Ⅲ");
        Long myEntry = backlogService.addToBacklog(me.getId(), game.getId());
        Long otherEntry = backlogService.addToBacklog(other.getId(), game.getId());

        //when
        int updated = gameService.updateName(game.getId(), "다크 소울 3");

        //then
        assertThat(updated).isEqualTo(2);
        assertThat(displayNameOf(myEntry)).isEqualTo("다크 소울 3");
        assertThat(displayNameOf(otherEntry)).isEqualTo("다크 소울 3");
        // 회귀 방지: 벌크 쿼리의 flushAutomatically가 빠지면 game.name 변경이 유실된다
        assertThat(gameRepository.findById(game.getId()).orElseThrow().getName())
                .isEqualTo("다크 소울 3");
    }

    @Test
    public void 이름_오버라이드가_있는_항목은_갱신되지_않는다() {
        //given
        Member me = saveMember("me@example.com");
        Member other = saveMember("other@example.com");
        Game game = saveGame("Bloodborne");
        Long overridden = backlogService.addToBacklog(me.getId(), game.getId());
        Long plain = backlogService.addToBacklog(other.getId(), game.getId());
        backlogService.updateOverrides(me.getId(), overridden,
                new OverrideCommand("블러드본", null, null, null, null));

        //when
        int updated = gameService.updateName(game.getId(), "Bloodborne Remastered");

        //then — 오버라이드가 이긴다 (WHERE name_override IS NULL이 걸러냄)
        assertThat(updated).isEqualTo(1);
        assertThat(displayNameOf(overridden)).isEqualTo("블러드본");
        assertThat(displayNameOf(plain)).isEqualTo("Bloodborne Remastered");
    }

    @Test
    public void 삭제된_항목도_갱신된다() {
        //given — 되살렸을 때 옛 이름이 나오면 안 된다
        Member me = saveMember("me@example.com");
        Game game = saveGame("Sekiro");
        Long entryId = backlogService.addToBacklog(me.getId(), game.getId());
        backlogService.delete(me.getId(), entryId);

        //when
        gameService.updateName(game.getId(), "세키로");

        //then
        assertThat(displayNameOf(entryId)).isEqualTo("세키로");
    }

    @Test
    public void 이름을_비우면_예외가_발생한다() {
        //given
        Game game = saveGame("Returnal");

        //when & then
        assertThatThrownBy(() -> gameService.updateName(game.getId(), "   "))
                .isInstanceOf(InvalidInputException.class);
    }

    /** em.clear() 이후에 읽어야 벌크 UPDATE 결과가 보인다 */
    @Test
    public void 마스터_출시일을_바꾸면_오버라이드_없는_항목의_정렬용_날짜가_갱신된다() {
        //given — 한 명은 출시일을 오버라이드했고 한 명은 안 했다
        Member me = saveMember("me@example.com");
        Member other = saveMember("other@example.com");
        Game game = saveGame("Elden Ring");
        Long overridden = backlogService.addToBacklog(me.getId(), game.getId());
        Long plain = backlogService.addToBacklog(other.getId(), game.getId());
        backlogService.updateOverrides(me.getId(), overridden,
                new OverrideCommand(null, null, null, LocalDate.of(2000, 1, 1), null));

        //when — Phase 4 재동기화의 진입점. Game.updateMasterInfo 직접 호출은 전파가 빠진다
        int updated = gameService.syncMasterInfo(game.getId(),
                List.of("FromSoftware"), List.of("Bandai Namco"), List.of("Action RPG"),
                LocalDate.of(2022, 2, 25), null);

        //then — 오버라이드가 있는 항목은 자기 날짜를 지킨다
        assertThat(updated).isEqualTo(1);
        assertThat(releasedOnResolvedOf(plain)).isEqualTo(LocalDate.of(2022, 2, 25));
        assertThat(releasedOnResolvedOf(overridden)).isEqualTo(LocalDate.of(2000, 1, 1));
    }

    @Test
    public void 출시일_전파는_소프트_삭제된_항목에도_적용된다() {
        //given — 되살렸을 때 옛 날짜로 정렬되면 안 된다
        Member me = saveMember("me@example.com");
        Game game = saveGame("Sekiro");
        Long entryId = backlogService.addToBacklog(me.getId(), game.getId());
        backlogService.delete(me.getId(), entryId);

        //when
        gameService.syncMasterInfo(game.getId(), null, null, null,
                LocalDate.of(2019, 3, 22), null);

        //then
        assertThat(releasedOnResolvedOf(entryId)).isEqualTo(LocalDate.of(2019, 3, 22));
    }

    private LocalDate releasedOnResolvedOf(Long entryId) {
        // 벌크 UPDATE가 컨텍스트를 비웠으므로(clearAutomatically) DB에서 새로 읽는다
        return em.find(BacklogEntry.class, entryId).getReleasedOnResolved();
    }

    private String displayNameOf(Long entryId) {
        return backlogEntryRepository.findById(entryId).orElseThrow().getDisplayName();
    }

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        return member;
    }

    private Game saveGame(String name) {
        Game game = Game.manual(name);
        gameRepository.persist(game);
        return game;
    }
}
