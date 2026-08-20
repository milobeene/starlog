package com.milobeene.gamebacklog.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.domain.OverrideCommand;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryRepository;
import com.milobeene.gamebacklog.backlog.service.BacklogService;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.EntityManager;
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
