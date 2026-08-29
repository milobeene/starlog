package com.milobeene.starlog.backlog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.BacklogStatus;
import com.milobeene.starlog.platform.domain.InputMethod;
import com.milobeene.starlog.backlog.domain.Playthrough;
import com.milobeene.starlog.backlog.domain.PlaythroughCommand;
import com.milobeene.starlog.backlog.domain.PlaythroughStatus;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.platform.domain.Device;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.platform.repository.DeviceRepository;
import com.milobeene.starlog.platform.repository.PlatformRepository;
import com.milobeene.starlog.platform.service.PlatformAccountService;
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
        InputMethod pad = saveInputMethod("닌텐도 컨트롤러");

        //when
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 5, 1), LocalDate.of(2026, 6, 20), PlaythroughStatus.COMPLETED,
                device.getId(), null, null, null, pad.getId(), "  DLC - 쿠파 왕국  "));

        em.flush();
        em.clear();

        //then
        Playthrough found = playthroughService.findAll(memberId, entryId).get(0);
        assertThat(found.getDevice().getLabel()).isEqualTo("Nintendo Switch");
        assertThat(found.getInputMethod().getName()).isEqualTo("닌텐도 컨트롤러");
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
                null, null, null, null, null, null));

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
                null, null, null, null, null, null));

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
                null, null, null, null, null, null));

        //when — 2회차 진행 중
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 5, 27), null, PlaythroughStatus.PLAYING,
                device.getId(), null, null, null, null, null));

        em.flush();
        em.clear();

        //then — 목록 카드가 필요로 하는 "N회차 · 기간 · 기기"가 참조 하나로 나온다
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        assertThat(entry.getLastPlaythrough().getSequenceNo()).isEqualTo(2);
        assertThat(entry.getLastPlaythrough().getStartedOn()).isEqualTo(LocalDate.of(2026, 5, 27));
        assertThat(entry.getLastPlaythrough().getFinishedOn()).isNull();
        assertThat(entry.getLastPlaythrough().getDevice().getLabel()).isEqualTo("Nintendo Switch");
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
                null, null, null, null, null, null)))
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
                null, null, null, null, null, null));

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
        Long accountId = platformAccountService.register(memberId, steam.getId(), null, "본계정");
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 2, 1), PlaythroughStatus.COMPLETED,
                null, null, accountId, null, null, null));

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

    // ── 소유권 (API 설계서 v0.2가 "Phase 3에서 막아야 한다"고 보류해둔 지점. 해제했다)

    @Test
    public void 남의_플랫폼_계정은_회차에_지정할_수_없다() {
        /*
         * given — 안 막으면 남의 계정 id를 넣어 상세 응답에 그 라벨을 실을 수 있다 (NFR-S7).
         * 404인 이유 — 403을 주면 "그 id는 존재한다"가 새어나간다
         */
        Member other = saveMember("other-owner@example.com");
        em.flush();
        Platform steam = savePlatform(other.getId(), "Steam");
        PlatformAccount othersAccount = PlatformAccount.onPlatform(other, steam, "남의 계정");
        em.persist(othersAccount);
        em.flush();

        Long entryId = givenEntry("Hollow Knight");

        //when //then
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                new PlaythroughCommand(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 5),
                        PlaythroughStatus.COMPLETED, null, null, othersAccount.getId(), null, null, null)))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    public void 삭제한_계정으로_플레이했던_회차도_수정할_수_있다() {
        /*
         * given — 소유권만 보고 소프트 삭제는 통과시키는 이유.
         * 계정을 지웠다고 그 계정으로 플레이했던 과거 기록을 못 고치게 되면 안 된다
         */
        Long entryId = givenEntry("Celeste");
        Platform steam = savePlatform("Steam");
        Member me = em.find(Member.class, memberId);
        PlatformAccount account = PlatformAccount.onPlatform(me, steam, "본계정");
        em.persist(account);
        em.flush();

        Long playthroughId = playthroughService.add(memberId, entryId,
                new PlaythroughCommand(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 5),
                        PlaythroughStatus.COMPLETED, null, null, account.getId(), null, null, null));

        account.softDelete(java.time.LocalDateTime.now());
        em.flush();

        //when //then
        assertThatCode(() -> playthroughService.update(memberId, playthroughId,
                new PlaythroughCommand(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 8),
                        PlaythroughStatus.COMPLETED, null, null, account.getId(), null, null, null)))
                .doesNotThrowAnyException();
    }

    @Test
    public void 없는_기기_id면_404다() {
        //given — 기기는 마스터라 소유권 검사는 없지만 존재 확인은 해야 한다
        Long entryId = givenEntry("Hollow Knight");

        //when //then
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                new PlaythroughCommand(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 5),
                        PlaythroughStatus.COMPLETED, 999999L, null, null, null, null, null)))
                .isInstanceOf(NotFoundException.class);
    }

    // ── BR-PT-02 무한대 점유 (v1.5 신설 조항. 감사에서 테스트 0건으로 드러남)

    @Test
    public void 진행_중_회차_이후_기간은_닫힌_회차로도_못_넣는다() {
        /*
         * given — BR-PT-02의 알맹이. 진행 중 회차는 **시작일부터 무한대까지** 점유한다.
         * BR-PT-03(열린 회차 2개 금지)은 둘 다 열려야 발동하므로,
         * 이 조합(열림 + 닫힘)을 막는 건 오직 occupiedUntil()의 LocalDate.MAX뿐이다.
         * 그 반환을 startedOn으로 바꿔도 기존 테스트는 전부 통과했다
         */
        Long entryId = givenEntry("Hollow Knight");
        playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 1, 1)));

        //when //then
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 10))))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 진행_중_회차보다_앞선_과거_회차는_넣을_수_있다() {
        //given — 점유는 시작일부터다. 그 이전은 비어 있다 (경계 반대편)
        Long entryId = givenEntry("Hollow Knight");
        playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 6, 1)));

        //when //then
        assertThatCode(() -> playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2025, 1, 1), LocalDate.of(2025, 2, 1))))
                .doesNotThrowAnyException();
    }

    @Test
    public void 진행_중_회차의_시작일_하루_전까지만_허용된다() {
        //given — 하루 차이로 갈리는 경계
        Long entryId = givenEntry("Hollow Knight");
        playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 6, 1)));

        //when //then — 5/31에 끝나면 통과
        assertThatCode(() -> playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 31))))
                .doesNotThrowAnyException();
    }

    @Test
    public void 진행_중_회차의_시작일에_닿으면_겹침이다() {
        //given — 닫힌 구간이라 하루라도 닿으면 겹친 것으로 본다
        Long entryId = givenEntry("Celeste");
        playthroughService.add(memberId, entryId, playing(LocalDate.of(2026, 6, 1)));

        //when //then
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 6, 1))))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 미래에_닫힌_회차가_있으면_그보다_앞선_진행_중_회차를_못_넣는다() {
        /*
         * given — occupiedUntil()의 MAX가 **this가 열린 회차일 때** 타는 유일한 경로다.
         * 위 테스트들은 전부 other(sibling)가 열린 경우라 overlaps 안의 인라인 MAX만 탄다.
         * 변이 테스트로 확인했다: occupiedUntil()의 MAX를 startedOn으로 바꿔도
         * 이 테스트가 없으면 전부 통과한다
         */
        Long entryId = givenEntry("Hollow Knight");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 10)));

        //when //then — 1/1에 시작한 진행 중 회차는 무한대까지 점유하므로 3월과 겹친다
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                playing(LocalDate.of(2026, 1, 1))))
                .isInstanceOf(ConflictException.class);
    }

    // ── BR-PT-06 닫힌 상태의 종료일 필수 (불변식 절반이 미검증이었음)

    @Test
    public void 완료_회차에_종료일이_없으면_예외가_발생한다() {
        //given — mustBeClosed()가 항상 false를 반환해도 기존 테스트는 전부 통과했다
        Long entryId = givenEntry("Hollow Knight");

        //when //then
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                inProgress(LocalDate.of(2026, 1, 1), PlaythroughStatus.COMPLETED)))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 중단_회차에_종료일이_없으면_예외가_발생한다() {
        //given
        Long entryId = givenEntry("Celeste");

        //when //then
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                inProgress(LocalDate.of(2026, 1, 1), PlaythroughStatus.DROPPED)))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 상태별_종료일_규칙표가_그대로다() {
        //given — BR-PT-06 표 전체를 한 번에 고정한다. enum이 늘거나 규칙이 뒤집히면 여기서 걸린다

        //when //then
        assertThat(PlaythroughStatus.PLAYING.mustBeOpen()).isTrue();
        assertThat(PlaythroughStatus.PLAYING.mustBeClosed()).isFalse();

        // PAUSED만 양쪽이 자유다 — "6/3~6/11 하다 멈춤"과 "시작하고 멈춤"을 둘 다 담아야 한다
        assertThat(PlaythroughStatus.PAUSED.mustBeOpen()).isFalse();
        assertThat(PlaythroughStatus.PAUSED.mustBeClosed()).isFalse();

        assertThat(PlaythroughStatus.DROPPED.mustBeOpen()).isFalse();
        assertThat(PlaythroughStatus.DROPPED.mustBeClosed()).isTrue();

        assertThat(PlaythroughStatus.COMPLETED.mustBeOpen()).isFalse();
        assertThat(PlaythroughStatus.COMPLETED.mustBeClosed()).isTrue();
    }

    // ── 기기는 회원 소유다 (마스터 공유를 폐기하면서 남의 것 차단이 필요해졌다)

    @Test
    public void 내_기기는_여러_대여도_각각_고를_수_있다() {
        //given — 같은 기종 두 대를 라벨로 구분한다
        Long entryId = givenEntry("Hollow Knight");
        Device myDevice = saveDevice("거실 스위치");
        Device bedroomDevice = saveDevice("침실 스위치");
        em.flush();

        //when
        Long playthroughId = playthroughService.add(memberId, entryId,
                new PlaythroughCommand(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 5),
                        PlaythroughStatus.COMPLETED, bedroomDevice.getId(), null, null, null, null, null));

        //then
        assertThat(em.find(Playthrough.class, playthroughId).getDevice().getId())
                .isEqualTo(bedroomDevice.getId());
        assertThat(myDevice.getId()).isNotEqualTo(bedroomDevice.getId());
    }

    @Test
    public void 남의_기기로는_회차를_남길_수_없다() {
        //given — 404로 뭉갠다. 403을 주면 "그 id는 존재한다"가 새어나간다 (NFR-S7)
        Long entryId = givenEntry("Celeste");
        Member other = saveMember("other-device@example.com");
        em.flush();
        Device othersDevice = saveDevice(other.getId(), "남의 스위치");
        em.flush();

        //when //then
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                new PlaythroughCommand(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 5),
                        PlaythroughStatus.COMPLETED, othersDevice.getId(), null, null, null, null, null)))
                .isInstanceOf(NotFoundException.class);
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

    @Test
    public void 영속성_컨텍스트가_비워진_뒤에도_기간_겹침_검증이_돈다() {
        //given — 실제 앱의 매 요청이 이 상태다 (새 컨텍스트에서 시작)
        Long entryId = givenEntry("Hollow Knight");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 5)));

        em.flush();
        em.clear();

        /*
         * 회귀 방지 — Playthrough.overlaps가 other의 값을 **필드로** 읽으면 여기서 NPE가 난다.
         * findOwned가 BacklogEntry.lastPlaythrough(LAZY)를 프록시로 만들고,
         * 뒤이은 형제 조회가 같은 id의 그 프록시를 돌려주는데,
         * 프록시는 메서드 호출만 가로채고 자기 필드는 null로 둔다
         */
        //when //then — 안 겹치는 기간이라 통과해야 한다
        assertThatCode(() -> playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 5))))
                .doesNotThrowAnyException();
    }

    @Test
    public void 컨텍스트가_비워져도_겹치는_기간은_잡아낸다() {
        //given — 위 테스트가 "예외 안 남"만 보므로, 검증이 실제로 도는지도 확인한다
        Long entryId = givenEntry("Celeste");
        playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20)));

        em.flush();
        em.clear();

        //when //then
        assertThatThrownBy(() -> playthroughService.add(memberId, entryId,
                finished(LocalDate.of(2026, 1, 10), LocalDate.of(2026, 1, 25))))
                .isInstanceOf(ConflictException.class);
    }

    private PlaythroughCommand inProgress(LocalDate startedOn, PlaythroughStatus status) {
        return new PlaythroughCommand(startedOn, null, status, null, null, null, null, null, null);
    }

    private PlaythroughCommand finished(LocalDate startedOn, LocalDate finishedOn) {
        return new PlaythroughCommand(startedOn, finishedOn, PlaythroughStatus.COMPLETED,
                null, null, null, null, null, null);
    }

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        return member;
    }

    private Device saveDevice(String label) {
        return saveDevice(memberId, label);
    }

    private Device saveDevice(Long ownerId, String label) {
        Device device = new Device(em.getReference(Member.class, ownerId), label, label, null);
        deviceRepository.persist(device);
        return device;
    }

    private Platform savePlatform(String name) {
        return savePlatform(memberId, name);
    }

    private Platform savePlatform(Long ownerId, String name) {
        Platform platform = new Platform(em.getReference(Member.class, ownerId), name);
        platformRepository.persist(platform);
        return platform;
    }

    private InputMethod saveInputMethod(String name) {
        InputMethod inputMethod =
                new InputMethod(em.getReference(Member.class, memberId), name);
        em.persist(inputMethod);
        return inputMethod;
    }
}
