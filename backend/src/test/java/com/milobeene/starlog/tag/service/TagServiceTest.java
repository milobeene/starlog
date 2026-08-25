package com.milobeene.starlog.tag.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.tag.domain.Tag;
import com.milobeene.starlog.tag.repository.TagRepository;
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
class TagServiceTest {

    @Autowired TagService tagService;
    @Autowired BacklogService backlogService;
    @Autowired TagRepository tagRepository;
    @Autowired GameRepository gameRepository;
    @Autowired EntityManager em;

    private Long memberId;

    // ── D-1: 붙이기 (등록 절차 없음)

    @Test
    public void 태그를_적으면_사전에_생긴다() {
        //given
        Long entryId = givenEntry("Hollow Knight");

        //when — 사전에 미리 등록하는 절차가 없다 (§6.7)
        tagService.replaceTags(memberId, entryId, List.of("명작", "메트로배니아"));

        em.flush();
        em.clear();

        //then
        assertThat(tagService.findDictionary(memberId))
                .extracting(Tag::getName)
                .containsExactlyInAnyOrder("명작", "메트로배니아");
    }

    @Test
    public void 같은_이름의_태그는_기존_행을_재사용한다() {
        //given
        Long first = givenEntry("Celeste");
        Long second = givenEntryForSameMember("Hades");
        tagService.replaceTags(memberId, first, List.of("명작"));

        //when
        tagService.replaceTags(memberId, second, List.of("명작"));

        em.flush();
        em.clear();

        //then — (member, name) 유니크. 태그 행은 하나뿐이다
        assertThat(countTagRows()).isEqualTo(1);
        assertThat(tagService.findTagNames(memberId, first)).containsExactly("명작");
        assertThat(tagService.findTagNames(memberId, second)).containsExactly("명작");
    }

    @Test
    public void 공백과_빈_문자열은_정규화된다() {
        //given
        Long entryId = givenEntry("Inside");

        //when
        tagService.replaceTags(memberId, entryId, List.of("  명작  ", "", "   ", "명작"));

        em.flush();
        em.clear();

        //then — strip 되고 빈 값은 버려지고 중복은 하나로
        assertThat(tagService.findTagNames(memberId, entryId)).containsExactly("명작");
    }

    // ── D-2: 전체 교체와 자동 소멸

    @Test
    public void 전체_교체하면_빠진_태그는_떨어지고_새_태그는_붙는다() {
        //given
        Long entryId = givenEntry("Gris");
        tagService.replaceTags(memberId, entryId, List.of("명작", "감성"));

        //when
        tagService.replaceTags(memberId, entryId, List.of("감성", "짧은게임"));

        em.flush();
        em.clear();

        //then
        assertThat(tagService.findTagNames(memberId, entryId))
                .containsExactlyInAnyOrder("감성", "짧은게임");
    }

    @Test
    public void 공유_태그는_한쪽에서_떼도_사전에_남는다() {
        //given — 두 항목이 "명작"을 공유한다
        Long first = givenEntry("Sekiro");
        Long second = givenEntryForSameMember("Bloodborne");
        tagService.replaceTags(memberId, first, List.of("명작"));
        tagService.replaceTags(memberId, second, List.of("명작"));

        //when — 한쪽에서만 뗀다
        tagService.replaceTags(memberId, first, List.of());

        em.flush();
        em.clear();

        //then — 다른 항목이 아직 쓰고 있으므로 사전에 남는다
        assertThat(tagService.findDictionary(memberId)).extracting(Tag::getName)
                .containsExactly("명작");
        assertThat(tagService.findTagNames(memberId, first)).isEmpty();
        assertThat(tagService.findTagNames(memberId, second)).containsExactly("명작");
    }

    @Test
    public void 마지막_연결을_떼면_사전에서_사라진다() {
        //given
        Long first = givenEntry("Tunic");
        Long second = givenEntryForSameMember("Braid");
        tagService.replaceTags(memberId, first, List.of("퍼즐"));
        tagService.replaceTags(memberId, second, List.of("퍼즐"));

        //when — 양쪽 모두에서 뗀다
        tagService.replaceTags(memberId, first, List.of());
        tagService.replaceTags(memberId, second, List.of());

        em.flush();
        em.clear();

        //then — 조회에서 걸러진다. 즉시 사라진다 (§6.7 v1.5)
        assertThat(tagService.findDictionary(memberId)).isEmpty();
    }

    @Test
    public void 뗐던_태그를_다시_붙이면_원래_행을_재사용한다() {
        //given — 방식 C의 부수 효과. 행을 안 지웠으므로 그대로 살아난다
        Long entryId = givenEntry("Journey");
        tagService.replaceTags(memberId, entryId, List.of("명작"));
        Long tagId = tagService.findDictionary(memberId).get(0).getId();

        tagService.replaceTags(memberId, entryId, List.of());
        assertThat(tagService.findDictionary(memberId)).isEmpty();

        //when
        tagService.replaceTags(memberId, entryId, List.of("명작"));

        em.flush();
        em.clear();

        //then — 새 행이 아니라 같은 id다
        assertThat(tagService.findDictionary(memberId).get(0).getId()).isEqualTo(tagId);
    }

    // ── D-3: 이름 변경·삭제

    @Test
    public void 태그_이름을_변경할_수_있다() {
        //given
        Long entryId = givenEntry("Limbo");
        tagService.replaceTags(memberId, entryId, List.of("명작"));
        Long tagId = tagService.findDictionary(memberId).get(0).getId();

        //when
        tagService.rename(memberId, tagId, "  갓겜  ");

        em.flush();
        em.clear();

        //then — 연결은 그대로고 이름만 바뀐다
        assertThat(tagService.findTagNames(memberId, entryId)).containsExactly("갓겜");
    }

    @Test
    public void 이미_있는_이름으로_변경하면_예외가_발생한다() {
        //given
        Long entryId = givenEntry("Cuphead");
        tagService.replaceTags(memberId, entryId, List.of("명작", "갓겜"));
        Long tagId = tagService.findDictionary(memberId).stream()
                .filter(t -> t.getName().equals("명작")).findFirst().orElseThrow().getId();

        //when & then — 병합하지 않고 거부한다
        assertThatThrownBy(() -> tagService.rename(memberId, tagId, "갓겜"))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("이미 있는 태그 이름");
    }

    @Test
    public void 태그를_삭제하면_연결도_함께_사라진다() {
        //given
        Long first = givenEntry("Stray");
        Long second = givenEntryForSameMember("Outer Wilds");
        tagService.replaceTags(memberId, first, List.of("명작"));
        tagService.replaceTags(memberId, second, List.of("명작"));
        Long tagId = tagService.findDictionary(memberId).get(0).getId();

        //when
        tagService.delete(memberId, tagId);

        em.flush();
        em.clear();

        //then
        assertThat(tagService.findTagNames(memberId, first)).isEmpty();
        assertThat(tagService.findTagNames(memberId, second)).isEmpty();
        assertThat(tagRepository.findById(tagId)).isEmpty();
    }

    @Test
    public void 소프트_삭제된_항목만_쓰던_태그는_사전에서_숨는다() {
        //given — 태그 연결은 되살리기 대비로 남지만, 사전 조회가 항목의 deletedAt을 본다 (리뷰 D1)
        Long entryId = givenEntry("Firewatch");
        tagService.replaceTags(memberId, entryId, List.of("워킹시뮬"));

        //when
        backlogService.delete(memberId, entryId);

        em.flush();
        em.clear();

        //then
        assertThat(tagService.findDictionary(memberId)).isEmpty();

        //when — 되살리면 연결이 그대로라 사전에도 다시 나온다
        backlogService.revive(memberId, entryId);

        em.flush();
        em.clear();

        //then
        assertThat(tagService.findDictionary(memberId))
                .extracting(Tag::getName)
                .containsExactly("워킹시뮬");
    }

    @Test
    public void 남의_태그는_건드릴_수_없다() {
        //given
        Long entryId = givenEntry("Hades");
        tagService.replaceTags(memberId, entryId, List.of("명작"));
        Long tagId = tagService.findDictionary(memberId).get(0).getId();
        Member stranger = saveMember("stranger@example.com");

        //when & then
        assertThatThrownBy(() -> tagService.rename(stranger.getId(), tagId, "갓겜"))
                .isInstanceOf(NotFoundException.class);   // 남의 것은 404 — 존재를 노출하지 않는다
    }

    // ── 헬퍼

    private Long givenEntry(String gameName) {
        Member member = saveMember("test@example.com");
        memberId = member.getId();
        return givenEntryForSameMember(gameName);
    }

    private Long givenEntryForSameMember(String gameName) {
        Game game = Game.manual(gameName);
        gameRepository.persist(game);
        return backlogService.addToBacklog(memberId, game.getId());
    }

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        return member;
    }

    /** 사전 조회가 아니라 실제 행 수. 재사용됐는지 확인하려면 유령 행까지 세야 한다 */
    private long countTagRows() {
        return em.createQuery("select count(t) from Tag t where t.member.id = :memberId", Long.class)
                .setParameter("memberId", memberId)
                .getSingleResult();
    }
}
