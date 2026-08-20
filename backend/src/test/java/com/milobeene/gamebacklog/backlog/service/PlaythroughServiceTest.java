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
import com.milobeene.gamebacklog.common.exception.ConflictException;
import com.milobeene.gamebacklog.common.exception.InvalidInputException;
import com.milobeene.gamebacklog.common.exception.NotFoundException;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.Platform;
import com.milobeene.gamebacklog.platform.repository.DeviceRepository;
import com.milobeene.gamebacklog.platform.repository.PlatformRepository;
import com.milobeene.gamebacklog.platform.service.PlatformAccountService;
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
    @Autowired PlatformRepository platformRepository;
    @Autowired PlatformAccountService platformAccountService;
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
                .isInstanceOf(InvalidInputException.class);
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
                .isInstanceOf(ConflictException.class)
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
                .isInstanceOf(ConflictException.class)
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
    public void 멈춘_회차에_종료일을_적을_수_있다() {
        //given — 실데이터의 포켓몬 소드실드 케이스: 6/3~6/11 하다 멈춤
        Long entryId = givenEntry("포켓몬스터 소드 실드");

        //when
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 6, 3), LocalDate.of(2026, 6, 11), PlaythroughStatus.PAUSED,
                null, null, null, null, null));

        em.flush();
        em.clear();

        //then — 상태는 PAUSED로 파생되고, lastPlayedOn은 시작일이 아니라 멈춘 날이다.
        // 열린 채로 뒀다면 6/3이 되어 최근 플레이순 정렬이 8일 틀어졌을 것
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getStatus()).isEqualTo(BacklogStatus.PAUSED);
        assertThat(entry.getLastPlayedOn()).isEqualTo(LocalDate.of(2026, 6, 11));
    }

    @Test
    public void 종료일을_적은_멈춘_회차는_새_회차를_막지_않는다() {
        //given — 판정 기준이 상태가 아니라 종료일이라서
        Long entryId = givenEntry("Palworld");
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2024, 3, 13), LocalDate.of(2025, 7, 21), PlaythroughStatus.PAUSED,
                null, null, null, null, null));

        //when
        playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 7, 14)));

        em.flush();
        em.clear();

        //then
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getStatus()).isEqualTo(BacklogStatus.PLAYING);
        assertThat(playthroughService.findAll(memberId, entryId)).hasSize(2);
    }

    @Test
    public void 마지막_회차가_비정규화된다() {
        //given
        Long entryId = givenEntry("링 피트 어드벤처");
        Device device = saveDevice("Nintendo Switch");
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2022, 1, 1), LocalDate.of(2023, 1, 1), PlaythroughStatus.COMPLETED,
                null, null, null, null, null));

        //when — 2회차 진행 중
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 5, 27), null, PlaythroughStatus.PLAYING,
                device.getId(), null, null, null, null));

        em.flush();
        em.clear();

        //then — 목록 카드가 필요로 하는 "N회차 · 기간 · 기기"가 참조 하나로 나온다
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getLastPlaythrough().getSequenceNo()).isEqualTo(2);
        assertThat(entry.getLastPlaythrough().getStartedOn()).isEqualTo(LocalDate.of(2026, 5, 27));
        assertThat(entry.getLastPlaythrough().getFinishedOn()).isNull();
        assertThat(entry.getLastPlaythrough().getDevice().getName()).isEqualTo("Nintendo Switch");
    }

    @Test
    public void 마지막_회차를_지우면_비정규화도_따라온다() {
        //given
        Long entryId = givenEntry("Split Fiction");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 3, 23), LocalDate.of(2026, 7, 5)));
        Long second = playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 10)));

        //when
        playthroughService.delete(memberId, second);

        em.flush();
        em.clear();

        //then — 지운 회차를 계속 가리키면 FK가 깨진다
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getLastPlaythrough().getSequenceNo()).isEqualTo(1);
        assertThat(entry.getLastPlayedOn()).isEqualTo(LocalDate.of(2026, 7, 5));
    }

    @Test
    public void 회차를_전부_지우면_비정규화가_비워진다() {
        //given
        Long entryId = givenEntry("Detroit Become Human");
        Long only = playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20)));

        //when
        playthroughService.delete(memberId, only);

        em.flush();
        em.clear();

        //then
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getLastPlaythrough()).isNull();
        assertThat(entry.getLastPlayedOn()).isNull();
    }

    @Test
    public void 진행_중인데_종료일을_주면_예외가_발생한다() {
        //given
        Long entryId = givenEntry("Cuphead");

        //when & then — 종료일과 상태는 한 몸이다
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 2, 1), PlaythroughStatus.PLAYING,
                null, null, null, null, null)))
                .isInstanceOf(InvalidInputException.class);
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
    public void 진행_중_회차가_있으면_과거_회차를_진행_중으로_수정할_수_없다() {
        //given — 과거 완료 회차 + 현재 진행 중 회차
        Long entryId = givenEntry("Nioh");
        Long past = playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2025, 1, 1), LocalDate.of(2025, 2, 1)));
        playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 1, 1)));

        //when & then — 과거 회차를 PAUSED(진행 중)로 되돌리려 하면 막힌다
        assertThatThrownBy(() -> playthroughService.update(memberId, past,
                inProgress(LocalDate.of(2025, 1, 1), PlaythroughStatus.PAUSED)))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("진행 중인 회차가 이미 있습니다");
    }

    @Test
    public void 기간이_이어지는_회차는_겹침이_아니다() {
        //given — 1/31에 끝나고 2/1에 시작: 하루 차이는 허용, 같은 날은 겹침 (BR-PT-02 경계)
        Long entryId = givenEntry("Ori");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31)));

        //when
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 10)));

        //then
        assertThat(playthroughService.findAll(memberId, entryId)).hasSize(2);
    }

    @Test
    public void 수정으로_기간이_겹치게_되면_예외가_발생한다() {
        //given
        Long entryId = givenEntry("Hollow Knight Silksong");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20)));
        Long second = playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 20)));

        //when & then — 시작일을 1회차 기간 안으로 당기면 BR-PT-02
        assertThatThrownBy(() -> playthroughService.update(memberId, second,
                finished(LocalDate.of(2026, 1, 15), LocalDate.of(2026, 3, 20))))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("겹칩니다");
    }

    @Test
    public void 삭제된_항목에는_회차를_추가할_수_없다() {
        //given
        Long entryId = givenEntry("Returnal");
        backlogService.delete(memberId, entryId);

        //when & then
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                playing(LocalDate.of(2026, 1, 1))))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("삭제된 항목");
    }

    @Test
    public void 삭제된_계정도_과거_회차에서는_계속_보인다() {
        //given — 계정을 소프트 삭제하는 이유가 이것이다 (§6.5)
        Long entryId = givenEntry("Persona 5");
        Platform steam = savePlatform("Steam");
        Long accountId = platformAccountService.register(memberId, steam.getId(), "본계정");
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 2, 1), PlaythroughStatus.COMPLETED,
                null, accountId, null, null, null));

        //when
        platformAccountService.delete(memberId, accountId);

        em.flush();
        em.clear();

        //then — 선택지에는 없지만 과거 기록에는 남는다
        Playthrough found = playthroughService.findAll(memberId, entryId).get(0);
        assertThat(found.getPlatformAccount().getAccountLabel()).isEqualTo("본계정");
        assertThat(found.getPlatformAccount().isDeleted()).isTrue();
        assertThat(platformAccountService.findSelectable(memberId)).isEmpty();
    }

    @Test
    public void 남의_항목에는_회차를_추가할_수_없다() {
        //given
        Long entryId = givenEntry("Hades");
        Member stranger = saveMember("stranger@example.com");

        //when & then
        assertThatThrownBy(() -> playthroughService.add(
                stranger.getId(), entryId, playing(LocalDate.of(2026, 1, 1))))
                .isInstanceOf(NotFoundException.class);   // 남의 것은 404
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

    private Platform savePlatform(String name) {
        Platform platform = Platform.of(name);
        platformRepository.persist(platform);
        return platform;
    }
}
