package com.milobeene.starlog.backlog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.BacklogStatus;
import com.milobeene.starlog.backlog.domain.OverrideCommand;
import com.milobeene.starlog.backlog.exception.RevivableEntryException;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.common.entity.Money;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.domain.GameSource;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")  // 인메모리 H2. dev용 H2 서버를 건드리지 않는다
@Transactional           // 각 테스트 끝나면 자동 롤백
class BacklogServiceTest {

    @Autowired BacklogService backlogService;
    @Autowired BacklogEntryRepository backlogEntryRepository;
    @Autowired GameRepository gameRepository;
    @Autowired EntityManager em;

    @Test
    public void 백로그에_담으면_표시명은_게임명이고_상태는_위시리스트다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Hollow Knight");

        //when
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        //then
        BacklogEntry found = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(found.getDisplayName()).isEqualTo("Hollow Knight");
        assertThat(found.getStatus()).isEqualTo(BacklogStatus.WISHLIST);
    }

    @Test
    public void 같은_게임을_두_번_담으면_예외가_발생한다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Celeste");
        backlogService.addToBacklog(member.getId(), game.getId());

        //when & then
        assertThatThrownBy(() -> backlogService.addToBacklog(member.getId(), game.getId()))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 개인_기록을_수정하면_변경_감지로_반영된다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Elden Ring");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        //when
        backlogService.updatePersonalRecord(
                member.getId(), entryId, new BigDecimal("84.35"), 120, "  최고  ");

        em.flush();     // 여기서 UPDATE가 나간다 (p6spy 로그 확인 지점)
        em.clear();     // 캐시 비우고 DB에서 다시 읽어야 진짜 반영됐는지 알 수 있다

        //then
        BacklogEntry found = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(found.getRating()).isEqualByComparingTo("84.4");   // 소수점 1자리 반올림
        assertThat(found.getPlayTimeHours()).isEqualTo(120);
        assertThat(found.getMemo()).isEqualTo("최고");                 // strip 적용
    }

    @Test
    public void 평점이_범위를_벗어나면_예외가_발생한다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Sekiro");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        //when & then
        assertThatThrownBy(() -> backlogService.updatePersonalRecord(
                member.getId(), entryId, new BigDecimal("100.1"), null, null))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 남의_백로그_항목은_수정할_수_없다() {
        //given
        Member owner = saveMember("owner@example.com");
        Member stranger = saveMember("stranger@example.com");
        Game game = saveGame("Hades");
        Long entryId = backlogService.addToBacklog(owner.getId(), game.getId());

        //when & then
        assertThatThrownBy(() -> backlogService.updatePersonalRecord(
                stranger.getId(), entryId, new BigDecimal("50.0"), null, null))
                .isInstanceOf(NotFoundException.class);   // 남의 것은 404
    }

    @Test
    public void 오버라이드를_설정하면_표시값이_오버라이드로_바뀐다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGameWithMaster("Final Fantasy VII",
                List.of("Square"), List.of("Square Enix"), LocalDate.of(1997, 1, 31));
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        //when
        backlogService.updateOverrides(member.getId(), entryId, new OverrideCommand(
                "파이널 판타지 7",
                List.of("스퀘어"),
                List.of("스퀘어 에닉스"),
                LocalDate.of(1997, 3, 3),
                new Money(new BigDecimal("59000"), "KRW")));

        em.flush();
        em.clear();

        //then
        BacklogEntry found = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(found.getDisplayName()).isEqualTo("파이널 판타지 7");
        assertThat(found.resolvedDevelopers()).containsExactly("스퀘어");
        assertThat(found.resolvedPublishers()).containsExactly("스퀘어 에닉스");
        assertThat(found.resolvedReleasedOn()).isEqualTo(LocalDate.of(1997, 3, 3));
        assertThat(found.resolvedListPrice().getAmount()).isEqualByComparingTo("59000");
    }

    @Test
    public void 오버라이드를_지우면_마스터_값이_다시_보인다() {
        //given — 먼저 오버라이드를 걸어둔다 (FR-BL-04)
        Member member = saveMember("test@example.com");
        Game game = saveGameWithMaster("Chrono Trigger",
                List.of("Square"), List.of("Square"), LocalDate.of(1995, 3, 11));
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.updateOverrides(member.getId(), entryId, new OverrideCommand(
                "크로노 트리거", List.of("스퀘어"), List.of("스퀘어"), LocalDate.of(1995, 8, 22), null));

        //when — 빈 값으로 전체 교체 = 오버라이드 삭제
        backlogService.updateOverrides(member.getId(), entryId,
                new OverrideCommand(null, List.of(), List.of(), null, null));

        em.flush();
        em.clear();

        //then
        BacklogEntry found = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(found.getDisplayName()).isEqualTo("Chrono Trigger");
        assertThat(found.resolvedDevelopers()).containsExactly("Square");
        assertThat(found.resolvedReleasedOn()).isEqualTo(LocalDate.of(1995, 3, 11));
    }

    @Test
    public void 이름만_오버라이드하면_나머지는_마스터_값을_유지한다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGameWithMaster("Nier: Automata",
                List.of("PlatinumGames"), List.of("Square Enix"), LocalDate.of(2017, 2, 23));
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        //when
        backlogService.updateOverrides(member.getId(), entryId,
                new OverrideCommand("니어 오토마타", null, null, null, null));

        em.flush();
        em.clear();

        //then
        BacklogEntry found = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(found.getDisplayName()).isEqualTo("니어 오토마타");
        assertThat(found.resolvedDevelopers()).containsExactly("PlatinumGames");
        assertThat(found.resolvedPublishers()).containsExactly("Square Enix");
        assertThat(found.resolvedReleasedOn()).isEqualTo(LocalDate.of(2017, 2, 23));
    }

    @Test
    public void 삭제하면_deletedAt이_기록된다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Outer Wilds");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        //when
        backlogService.delete(member.getId(), entryId);

        em.flush();
        em.clear();

        //then — 행 자체는 남아있다 (소프트 삭제)
        BacklogEntry found = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(found).isNotNull();
        assertThat(found.isDeleted()).isTrue();
        assertThat(found.getDeletedAt()).isNotNull();
    }

    @Test
    public void 이미_삭제된_항목은_다시_삭제할_수_없다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Inside");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.delete(member.getId(), entryId);

        //when & then
        assertThatThrownBy(() -> backlogService.delete(member.getId(), entryId))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 삭제된_항목은_수정할_수_없다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Limbo");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.delete(member.getId(), entryId);

        //when & then
        assertThatThrownBy(() -> backlogService.updatePersonalRecord(
                member.getId(), entryId, new BigDecimal("90.0"), null, null))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 삭제_후_같은_게임을_다시_담으면_되살리기_안내가_온다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Braid");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.delete(member.getId(), entryId);

        //when & then — 신규 INSERT가 아니라 "복원할까요?" 분기로 간다 (§7.4)
        assertThatThrownBy(() -> backlogService.addToBacklog(member.getId(), game.getId()))
                .isInstanceOf(RevivableEntryException.class)
                .extracting(e -> ((RevivableEntryException) e).getEntryId())
                .isEqualTo(entryId);
    }

    @Test
    public void 되살리면_기존_기록이_그대로_돌아온다() {
        //given — 기록을 남기고 삭제한다
        Member member = saveMember("test@example.com");
        Game game = saveGame("Journey");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.updatePersonalRecord(
                member.getId(), entryId, new BigDecimal("92.0"), 8, "짧고 좋다");
        backlogService.delete(member.getId(), entryId);

        //when
        backlogService.revive(member.getId(), entryId);

        em.flush();
        em.clear();

        //then — 백지가 아니라 삭제 전 값 그대로 (§7.4)
        BacklogEntry found = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(found.isDeleted()).isFalse();
        assertThat(found.getRating()).isEqualByComparingTo("92.0");
        assertThat(found.getPlayTimeHours()).isEqualTo(8);
        assertThat(found.getMemo()).isEqualTo("짧고 좋다");
    }

    @Test
    public void 되살린_뒤에는_수정할_수_있다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Gris");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.delete(member.getId(), entryId);
        backlogService.revive(member.getId(), entryId);

        //when
        backlogService.updatePersonalRecord(
                member.getId(), entryId, new BigDecimal("77.0"), null, null);

        em.flush();
        em.clear();

        //then
        BacklogEntry found = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(found.getRating()).isEqualByComparingTo("77.0");
    }

    @Test
    public void 삭제되지_않은_항목은_되살릴_수_없다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Tunic");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        //when & then
        assertThatThrownBy(() -> backlogService.revive(member.getId(), entryId))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 단건_조회가_된다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Hades II");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        //when
        BacklogEntry found = backlogService.findOne(member.getId(), entryId);

        //then
        assertThat(found.getDisplayName()).isEqualTo("Hades II");
    }

    @Test
    public void 삭제된_항목은_조회에서_없는_것으로_취급된다() {
        //given
        Member member = saveMember("test@example.com");
        Game game = saveGame("Cuphead");
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());
        backlogService.delete(member.getId(), entryId);

        //when & then — "삭제된 항목입니다"가 아니라 "찾을 수 없습니다".
        // 조회는 존재를 노출하지 않는다 (수정 경로와 의도적으로 다름)
        assertThatThrownBy(() -> backlogService.findOne(member.getId(), entryId))
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("찾을 수 없습니다");
    }

    @Test
    public void 목록은_표시명_순이고_삭제된_항목은_빠진다() {
        //given
        Member member = saveMember("test@example.com");
        Long keptA = backlogService.addToBacklog(member.getId(), saveGame("Celeste").getId());
        backlogService.addToBacklog(member.getId(), saveGame("Aria").getId());
        Long deleted = backlogService.addToBacklog(member.getId(), saveGame("Braid").getId());
        backlogService.delete(member.getId(), deleted);

        em.flush();
        em.clear();

        //when
        List<BacklogEntry> found = backlogService.findAll(member.getId());

        //then — Braid는 삭제됐으므로 빠지고, 나머지는 이름순
        assertThat(found).extracting(BacklogEntry::getDisplayName)
                .containsExactly("Aria", "Celeste");
        assertThat(found).extracting(BacklogEntry::getId).doesNotContain(deleted);
        assertThat(keptA).isNotNull();
    }

    @Test
    public void 목록에_남의_항목은_안_나온다() {
        //given
        Member me = saveMember("me@example.com");
        Member other = saveMember("other@example.com");
        Game game = saveGame("Stray");
        backlogService.addToBacklog(other.getId(), game.getId());

        em.flush();
        em.clear();

        //when
        List<BacklogEntry> found = backlogService.findAll(me.getId());

        //then
        assertThat(found).isEmpty();
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

    private Game saveGameWithMaster(String name, List<String> developers,
                                    List<String> publishers, LocalDate releasedOn) {
        Game game = Game.manual(name);
        game.updateMasterInfo(developers, publishers, null, releasedOn, null);
        gameRepository.persist(game);
        return game;
    }
}