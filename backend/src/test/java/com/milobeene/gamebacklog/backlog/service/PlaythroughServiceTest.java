package com.milobeene.gamebacklog.backlog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.domain.BacklogStatus;
import com.milobeene.gamebacklog.backlog.domain.InputMethod;
import com.milobeene.gamebacklog.backlog.domain.Playthrough;
import com.milobeene.gamebacklog.backlog.domain.PlaythroughCommand;
import com.milobeene.gamebacklog.backlog.domain.PlaythroughStatus;
import com.milobeene.gamebacklog.backlog.repository.BacklogEntryRepository;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.repository.DeviceRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PlaythroughServiceTest {

    @Autowired PlaythroughService playthroughService;
    @Autowired BacklogService backlogService;
    @Autowired BacklogEntryRepository backlogEntryRepository;
    @Autowired GameRepository gameRepository;
    @Autowired DeviceRepository deviceRepository;
    @Autowired EntityManager em;

    @Test
    public void 회차를_추가하면_항목_상태가_PLAYING이_된다() {
        //given
        Long entryId = givenEntry("Hollow Knight");

        //when
        playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 3, 1)));

        em.flush();
        em.clear();

        //then — 사용자가 status를 직접 넣지 않았는데 파생됐다
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getStatus()).isEqualTo(BacklogStatus.PLAYING);
        assertThat(entry.getLastPlayedOn()).isEqualTo(LocalDate.of(2026, 3, 1));
    }

    @Test
    public void 회차_번호는_1부터_순차로_붙는다() {
        //given
        Long entryId = givenEntry("Celeste");

        //when
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20)));
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 20)));

        //then
        assertThat(playthroughService.findAll(memberId, entryId))
                .extracting(Playthrough::getSequenceNo)
                .containsExactly(1, 2);
    }

    @Test
    public void 회차_속성을_기록할_수_있다() {
        //given
        Long entryId = givenEntry("Zelda TotK");
        Device device = saveDevice("Nintendo Switch");

        //when
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 5, 1), LocalDate.of(2026, 6, 20), PlaythroughStatus.COMPLETED,
                device.getId(), null, null, InputMethod.NINTENDO, "  DLC - 쿠파 왕국  "));

        em.flush();
        em.clear();

        //then
        Playthrough found = playthroughService.findAll(memberId, entryId).get(0);
        assertThat(found.getDevice().getName()).isEqualTo("Nintendo Switch");
        assertThat(found.getInputMethod()).isEqualTo(InputMethod.NINTENDO);
        assertThat(found.getLabel()).isEqualTo("DLC - 쿠파 왕국");   // strip 적용
    }

    // ── 검증 규칙 (BR-PT-01 ~ 04)

    @Test
    public void 종료일이_시작일보다_빠르면_예외가_발생한다() {
        //given
        Long entryId = givenEntry("Inside");

        //when & then — BR-PT-01
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 3, 10), LocalDate.of(2026, 3, 1))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    public void 당일_완료도_유효하다() {
        //given
        Long entryId = givenEntry("Journey");
        LocalDate sameDay = LocalDate.of(2026, 3, 1);

        //when — BR-PT-04
        playthroughService.add(memberId, entryId, finished(sameDay, sameDay));

        em.flush();
        em.clear();

        //then
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getStatus()).isEqualTo(BacklogStatus.COMPLETED);
    }

    @Test
    public void 기간이_겹치는_회차는_추가할_수_없다() {
        //given
        Long entryId = givenEntry("Gris");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31)));

        //when & then — BR-PT-02. 하루라도 닿으면 겹친 것
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 31), LocalDate.of(2026, 2, 10))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("겹칩니다");
    }

    @Test
    public void 진행_중_회차가_있으면_새_회차를_추가할_수_없다() {
        //given
        Long entryId = givenEntry("Stray");
        playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 1, 1)));

        //when & then — BR-PT-03. PAUSED로 넣어도 마찬가지다
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                inProgress(LocalDate.of(2026, 6, 1), PlaythroughStatus.PAUSED)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("진행 중인 회차가 이미 있습니다");
    }

    @Test
    public void 진행_중_회차를_닫으면_새_회차를_추가할_수_있다() {
        //given
        Long entryId = givenEntry("Tunic");
        Long first = playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 1, 1)));

        //when — 기존 회차를 COMPLETED로 닫고 새 회차를 연다
        playthroughService.update(memberId, first,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20)));
        playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 3, 1)));

        em.flush();
        em.clear();

        //then
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getStatus()).isEqualTo(BacklogStatus.PLAYING);
        assertThat(entry.getLastPlayedOn()).isEqualTo(LocalDate.of(2026, 3, 1));
    }

    @Test
    public void 진행_중인데_종료일을_주면_예외가_발생한다() {
        //given
        Long entryId = givenEntry("Cuphead");

        //when & then — 종료일과 상태는 한 몸이다
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 2, 1), PlaythroughStatus.PLAYING,
                null, null, null, null, null)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ── 상태 파생 (§7.6)

    @Test
    public void 과거_회차를_뒤늦게_추가해도_상태가_뒤집히지_않는다() {
        //given — 2026년에 완료
        Long entryId = givenEntry("Dark Souls");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 6, 1)));

        //when — 2025년 중단 기록을 나중에 입력한다 (번호는 2번이지만 날짜는 과거)
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2025, 1, 1), LocalDate.of(2025, 2, 1), PlaythroughStatus.DROPPED,
                null, null, null, null, null));

        em.flush();
        em.clear();

        //then — 번호 기준이면 DROPPED로 뒤집힌다. 날짜 기준이라 COMPLETED가 유지된다
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getStatus()).isEqualTo(BacklogStatus.COMPLETED);
        assertThat(entry.getLastPlayedOn()).isEqualTo(LocalDate.of(2026, 6, 1));
    }

    @Test
    public void 회차를_삭제하면_상태가_재동기화된다() {
        //given
        Long entryId = givenEntry("Sekiro");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20)));
        Long latest = playthroughService.add(memberId, entryId,
                inProgress(LocalDate.of(2026, 3, 1), PlaythroughStatus.PAUSED));

        //when — 진행 중이던 최신 회차를 지운다
        playthroughService.delete(memberId, latest);

        em.flush();
        em.clear();

        //then — 남은 1회차 기준으로 되돌아간다
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getStatus()).isEqualTo(BacklogStatus.COMPLETED);
        assertThat(entry.getLastPlayedOn()).isEqualTo(LocalDate.of(2026, 1, 20));
    }

    @Test
    public void 회차_번호는_구멍을_메우지_않는다() {
        //given
        Long entryId = givenEntry("Braid");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20)));
        Long second = playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 20)));
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 20)));

        //when — 2회차를 지운다
        playthroughService.delete(memberId, second);

        //then — 1, 3이 남고 재부여하지 않는다
        assertThat(playthroughService.findAll(memberId, entryId))
                .extracting(Playthrough::getSequenceNo)
                .containsExactly(1, 3);
    }

    @Test
    public void 남의_항목에는_회차를_추가할_수_없다() {
        //given
        Long entryId = givenEntry("Hades");
        Member stranger = saveMember("stranger@example.com");

        //when & then
        assertThatThrownBy(() -> playthroughService.add(
                stranger.getId(), entryId, playing(LocalDate.of(2026, 1, 1))))
                .isInstanceOf(IllegalStateException.class);
    }

    // ── 헬퍼

    private Long memberId;

    private Long givenEntry(String gameName) {
        Member member = saveMember("test@example.com");
        memberId = member.getId();
        Game game = Game.manual(gameName);
        gameRepository.persist(game);
        return backlogService.addToBacklog(memberId, game.getId());
    }

    private PlaythroughCommand playing(LocalDate startedOn) {
        return inProgress(startedOn, PlaythroughStatus.PLAYING);
    }

    private PlaythroughCommand inProgress(LocalDate startedOn, PlaythroughStatus status) {
        return new PlaythroughCommand(startedOn, null, status, null, null, null, null, null);
    }

    private PlaythroughCommand finished(LocalDate startedOn, LocalDate finishedOn) {
        return new PlaythroughCommand(startedOn, finishedOn, PlaythroughStatus.COMPLETED,
                null, null, null, null, null);
    }

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        return member;
    }

    private Device saveDevice(String name) {
        Device device = Device.of(name);
        deviceRepository.persist(device);
        return device;
    }
}
