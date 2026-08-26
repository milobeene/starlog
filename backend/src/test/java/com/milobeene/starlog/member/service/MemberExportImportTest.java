package com.milobeene.starlog.member.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.backlog.domain.AcquisitionCommand;
import com.milobeene.starlog.backlog.domain.AcquisitionMethod;
import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.BacklogStatus;
import com.milobeene.starlog.backlog.domain.OverrideCommand;
import com.milobeene.starlog.backlog.domain.PlaythroughCommand;
import com.milobeene.starlog.backlog.domain.PlaythroughStatus;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.backlog.service.AcquisitionService;
import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.backlog.service.PlaythroughService;
import com.milobeene.starlog.common.entity.Money;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.dto.MemberExport;
import com.milobeene.starlog.platform.domain.Device;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.platform.repository.DeviceRepository;
import com.milobeene.starlog.platform.repository.PlatformAccountRepository;
import com.milobeene.starlog.platform.repository.PlatformRepository;
import com.milobeene.starlog.support.ControllerTestSupport;
import com.milobeene.starlog.tag.service.GenreService;
import com.milobeene.starlog.tag.service.TagService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 데이터 내보내기·가져오기 (v1.0 작업순서 0번).
 *
 * **왕복이 이 기능의 전부다.** 내보낸 걸 다시 넣었을 때 같은 것이 안 나오면
 * 백업이 아니라 그냥 파일이다. 그래서 개수만 세지 않고 **파생 상태까지** 대조한다 —
 * `status`·`displayName`·`lastPlaythrough`는 내보내기가 담지 않고 가져오기가 다시
 * 계산하는 값이라, 여기가 깨지면 전 항목이 위시리스트에 이름 없이 복원된다.
 */
class MemberExportImportTest extends ControllerTestSupport {

    @Autowired MemberExportService exportService;
    @Autowired MemberImportService importService;
    @Autowired BacklogService backlogService;
    @Autowired PlaythroughService playthroughService;
    @Autowired AcquisitionService acquisitionService;
    @Autowired TagService tagService;
    @Autowired GenreService genreService;
    @Autowired BacklogEntryRepository backlogEntryRepository;
    @Autowired PlatformRepository platformRepository;
    @Autowired PlatformAccountRepository platformAccountRepository;
    @Autowired DeviceRepository deviceRepository;

    @Test
    public void 내보내고_빈_계정에_넣으면_그대로_복원된다() {
        //given — 회차·취득·태그·장르·오버라이드가 다 붙은 항목
        Member source = saveMember();
        richEntry(source, "Celeste");
        em.flush();
        em.clear();

        //when
        MemberExport data = exportService.export(source.getId());
        em.flush();
        em.clear();

        Member target = saveMember();
        em.flush();
        MemberImportService.Result result = importService.importInto(target.getId(), data);
        em.flush();
        em.clear();

        //then — 개수
        assertThat(result.entries()).isEqualTo(1);
        assertThat(result.playthroughs()).isEqualTo(1);
        assertThat(result.acquisitions()).isEqualTo(1);

        //then — 내용
        BacklogEntry entry = onlyEntryOf(target);
        assertThat(entry.getNameOverride()).isEqualTo("셀레스테");
        assertThat(entry.getRating()).isEqualByComparingTo("92.0");
        assertThat(entry.getPlayTimeHours()).isEqualTo(30);
        assertThat(entry.getMemo()).isEqualTo("- 좋았다");
        assertThat(entry.getTag().getName()).isEqualTo("인디");
        assertThat(entry.getDeveloperOverrides()).containsExactly("Maddy Makes Games");
        assertThat(entry.getListPriceOverride().getAmount()).isEqualByComparingTo("19800");

        //then — **파생 상태가 다시 계산됐는가.** 이게 이 테스트의 핵심이다
        assertThat(entry.getDisplayName()).as("표시명은 오버라이드에서 파생된다").isEqualTo("셀레스테");
        assertThat(entry.getStatus()).as("회차가 완료라 항목도 완료여야 한다")
                .isEqualTo(BacklogStatus.COMPLETED);
        assertThat(entry.getLastPlaythrough()).as("최신 회차 참조도 다시 붙어야 한다").isNotNull();
        assertThat(entry.getLastPlayedOn()).isEqualTo(LocalDate.parse("2026-01-20"));

        //then — 원본은 그대로다 (내보내기가 정말 읽기 전용인가)
        assertThat(backlogEntryRepository.findAllForExport(source.getId())).hasSize(1);
    }

    @Test
    public void 회차와_취득의_참조가_이름으로_다시_이어진다() {
        //given — id는 DB마다 다르니 이름으로 잇는다. 그게 실제로 되는지
        Member source = saveMember();
        richEntry(source, "Hades");
        em.flush();
        em.clear();

        //when
        MemberExport data = exportService.export(source.getId());
        Member target = saveMember();
        em.flush();
        importService.importInto(target.getId(), data);
        em.flush();
        em.clear();

        //then
        BacklogEntry entry = onlyEntryOf(target);
        var playthrough = entry.getPlaythroughs().getFirst();
        assertThat(playthrough.getDevice().getLabel()).isEqualTo("거실 스위치");
        assertThat(playthrough.getPlatformAccount().getAccountLabel()).isEqualTo("Beene");
        assertThat(entry.getAcquisitions().getFirst().getPlatform().getName()).isEqualTo("Steam");

        //then — **가져온 회원의 것이어야 한다.** 남의 선택지를 물면 데이터가 새어 나간다
        assertThat(playthrough.getDevice().getMember().getId()).isEqualTo(target.getId());
    }

    @Test
    public void 마스터_게임은_이미_있으면_그_행을_다시_쓴다() {
        //given — 마스터는 공용 데이터다. 회원마다 복제하면 병합·재동기화가 의미를 잃는다
        Member source = saveMember();
        // **고유 이름을 쓴다.** 시드·다른 테스트와 이름이 겹치면 가져오기가 그 행을 집어
        //   "같은 행을 다시 쓴다"가 아니라 "남의 행을 집었다"를 검증하게 된다
        Long gameId = richEntry(source, "고유마스터" + System.nanoTime());
        em.flush();
        em.clear();

        MemberExport data = exportService.export(source.getId());
        Member target = saveMember();
        em.flush();

        //when
        importService.importInto(target.getId(), data);
        em.flush();
        em.clear();

        //then
        assertThat(onlyEntryOf(target).getGame().getId()).isEqualTo(gameId);
    }

    @Test
    public void 삭제한_항목도_삭제된_채로_복원된다() {
        //given — 백업은 "지금 보이는 것"이 아니라 "가진 것 전부"여야 한다
        Member source = saveMember();
        richEntry(source, "Dead Cells");
        Long entryId = onlyEntryOf(source).getId();
        backlogService.delete(source.getId(), entryId);
        em.flush();
        em.clear();

        //when
        MemberExport data = exportService.export(source.getId());
        assertThat(data.entries()).as("삭제된 것도 내보내진다").hasSize(1);

        Member target = saveMember();
        em.flush();
        importService.importInto(target.getId(), data);
        em.flush();
        em.clear();

        //then
        assertThat(onlyEntryOf(target).isDeleted()).isTrue();
    }

    @Test
    public void 이미_데이터가_있는_계정에는_거부한다() {
        //given — 병합은 "같은 항목인가" 판정이 필요한데 그게 이 작업보다 크다
        Member source = saveMember();
        richEntry(source, "Slay the Spire");
        em.flush();

        MemberExport data = exportService.export(source.getId());

        //when //then
        assertThatThrownBy(() -> importService.importInto(source.getId(), data))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("빈 계정");
    }

    @Test
    public void 삭제된_항목만_있어도_빈_계정이_아니다() {
        //given — 눈에 안 보이는 항목이 남았는데 덮어쓰면 같은 게임이 두 벌이 되어
        //        유니크 제약(uk_backlog_member_game)에 걸린다
        Member source = saveMember();
        richEntry(source, "Bastion");
        backlogService.delete(source.getId(), onlyEntryOf(source).getId());
        em.flush();

        Member other = saveMember();
        em.flush();
        MemberExport data = exportService.export(other.getId());

        //when //then
        assertThatThrownBy(() -> importService.importInto(source.getId(), data))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    public void 형식_버전이_다르면_거부한다() {
        //given — 나중에 포맷이 바뀌었을 때 조용히 반만 들어가는 것보다 낫다
        Member target = saveMember();
        em.flush();
        MemberExport bogus = new MemberExport(99, null, null, null, List.of(), List.of());

        //when //then
        assertThatThrownBy(() -> importService.importInto(target.getId(), bogus))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("형식");
    }

    @Test
    public void 자격증명은_내보내지_않는다() {
        //given — 이 파일은 동기화 폴더에 놓일 물건이다. 해시가 실려 다니면 안 된다
        Member source = saveMember();
        richEntry(source, "Tunic");
        em.flush();

        //when
        MemberExport data = exportService.export(source.getId());

        //then — 레코드에 자리 자체가 없다. 담을 곳이 없으면 실수로도 안 담긴다
        assertThat(MemberExport.Profile.class.getRecordComponents())
                .extracting(java.lang.reflect.RecordComponent::getName)
                .containsExactly("email", "nickname", "memo", "backgroundColors");
        assertThat(data.profile().email()).isEqualTo(source.getEmail());
    }

    @Test
    public void 남의_데이터는_안_섞인다() {
        //given
        Member mine = saveMember();
        Member other = saveMember();
        richEntry(mine, "Celeste");
        richEntry(other, "Hades");
        em.flush();
        em.clear();

        //when
        MemberExport data = exportService.export(mine.getId());

        //then
        assertThat(data.entries()).hasSize(1);
        assertThat(data.games()).hasSize(1);
        assertThat(data.games().getFirst().name()).isEqualTo("Celeste");
        assertThat(data.catalog().platforms()).containsExactly("Steam");
        assertThat(data.catalog().accounts()).hasSize(1);
    }

    /* ── 픽스처 ─────────────────────────────────────────── */

    private BacklogEntry onlyEntryOf(Member member) {
        List<BacklogEntry> entries = backlogEntryRepository.findAllForExport(member.getId());
        assertThat(entries).hasSize(1);
        return entries.getFirst();
    }

    /** 회차·취득·태그·장르·오버라이드가 다 붙은 항목 하나. 반환값은 마스터 게임 id */
    private Long richEntry(Member member, String gameName) {
        var game = saveGame(gameName);
        em.flush();
        Long entryId = backlogService.addToBacklog(member.getId(), game.getId());

        Platform platform = new Platform(member, "Steam");
        platformRepository.persist(platform);
        PlatformAccount account = new PlatformAccount(member, platform, "Beene");
        platformAccountRepository.persist(account);
        Device device = new Device(member, "Nintendo Switch", "거실 스위치", "독 모드");
        deviceRepository.persist(device);
        em.flush();

        backlogService.updatePersonalRecord(member.getId(), entryId,
                new BigDecimal("92.0"), 30, "- 좋았다");
        backlogService.updateOverrides(member.getId(), entryId, new OverrideCommand(
                "셀레스테", List.of("Maddy Makes Games"), List.of(),
                LocalDate.parse("2018-01-25"), new Money(new BigDecimal("19800"), "KRW")));
        tagService.changeTag(member.getId(), entryId, "인디");
        genreService.replaceGenres(member.getId(), entryId, List.of("플랫포머", "로그라이크"));

        playthroughService.add(member.getId(), entryId, new PlaythroughCommand(
                LocalDate.parse("2026-01-01"), LocalDate.parse("2026-01-20"),
                PlaythroughStatus.COMPLETED,
                device.getId(), account.getId(), null, null, null));
        acquisitionService.add(member.getId(), entryId, new AcquisitionCommand(
                AcquisitionMethod.PURCHASED, platform.getId(), account.getId(), null,
                new BigDecimal("19800"), "KRW", LocalDate.parse("2025-12-24"), null));
        em.flush();
        return game.getId();
    }
}
