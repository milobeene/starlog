package com.milobeene.starlog.backlog.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.backlog.domain.Acquisition;
import com.milobeene.starlog.backlog.domain.AcquisitionCommand;
import com.milobeene.starlog.backlog.domain.AcquisitionMethod;
import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.BacklogStatus;
import com.milobeene.starlog.backlog.domain.PlaythroughCommand;
import com.milobeene.starlog.backlog.domain.PlaythroughStatus;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.repository.PlatformRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AcquisitionServiceTest {

    @Autowired AcquisitionService acquisitionService;
    @Autowired PlaythroughService playthroughService;
    @Autowired BacklogService backlogService;
    @Autowired BacklogEntryRepository backlogEntryRepository;
    @Autowired GameRepository gameRepository;
    @Autowired PlatformRepository platformRepository;
    @Autowired EntityManager em;

    private Long memberId;

    // ── C-1: 취득 추가

    @Test
    public void 취득을_추가하면_상태가_BACKLOG가_된다() {
        //given — 담기 직후에는 취득이 없어 WISHLIST다
        Long entryId = givenEntry("Hollow Knight");
        assertThat(statusOf(entryId)).isEqualTo(BacklogStatus.WISHLIST);

        //when
        acquisitionService.add(memberId, entryId, purchased("39000", "KRW"));

        em.flush();
        em.clear();

        //then
        assertThat(statusOf(entryId)).isEqualTo(BacklogStatus.BACKLOG);
    }

    @Test
    public void 금액과_통화를_함께_기록한다() {
        //given
        Long entryId = givenEntry("Celeste");
        Platform steam = savePlatform("Steam");

        //when
        acquisitionService.add(memberId, entryId, new AcquisitionCommand(
                AcquisitionMethod.PURCHASED, steam.getId(), null, null,
                new BigDecimal("19.99"), "usd", LocalDate.of(2026, 1, 5), "  겨울 세일  "));

        em.flush();
        em.clear();

        //then
        Acquisition found = acquisitionService.findAll(memberId, entryId).get(0);
        assertThat(found.getPrice().getAmount()).isEqualByComparingTo("19.99");
        assertThat(found.getPrice().getCurrency()).isEqualTo("USD");   // 대문자로 수렴
        assertThat(found.getPlatform().getName()).isEqualTo("Steam");
        assertThat(found.getLabel()).isEqualTo("겨울 세일");
    }

    @Test
    public void 실물_구매는_계정_없이_플랫폼만_기록한다() {
        //given
        Long entryId = givenEntry("Zelda TotK");
        Platform nintendo = savePlatform("Nintendo");

        //when — §6.6: 계정이 없으면 platformAccount는 null
        acquisitionService.add(memberId, entryId, new AcquisitionCommand(
                AcquisitionMethod.PURCHASED, nintendo.getId(), null, null,
                new BigDecimal("64800"), "KRW", LocalDate.of(2026, 5, 1), "실물 패키지"));

        em.flush();
        em.clear();

        //then
        Acquisition found = acquisitionService.findAll(memberId, entryId).get(0);
        assertThat(found.getPlatform()).isNotNull();
        assertThat(found.getPlatformAccount()).isNull();
    }

    @Test
    public void 금액_없는_취득도_기록할_수_있다() {
        //given
        Long entryId = givenEntry("Epic 무료배포 게임");

        //when — 제약 최소화: 금액은 모든 방식에서 선택
        acquisitionService.add(memberId, entryId, new AcquisitionCommand(
                AcquisitionMethod.FREE, null, null, null, null, null, null, null));

        em.flush();
        em.clear();

        //then
        assertThat(acquisitionService.findAll(memberId, entryId).get(0).getPrice()).isNull();
        assertThat(statusOf(entryId)).isEqualTo(BacklogStatus.BACKLOG);
    }

    @Test
    public void 음수_금액과_잘못된_통화는_거부된다() {
        //given
        Long entryId = givenEntry("Inside");

        //when & then
        assertThatThrownBy(() -> acquisitionService.add(memberId, entryId, purchased("-100", "KRW")))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("0 이상");

        assertThatThrownBy(() -> acquisitionService.add(memberId, entryId, purchased("100", "XYZ")))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("ISO 4217");
    }

    // ── C-2: 복수 취득

    @Test
    public void 같은_게임에_취득을_여러_건_남길_수_있다() {
        //given — FR-ACQ-06: 재구매·DLC
        Long entryId = givenEntry("Mario Wonder");

        //when
        acquisitionService.add(memberId, entryId, labeled("59000", "KRW", "스팀판"));
        acquisitionService.add(memberId, entryId, labeled("64800", "KRW", "스위치판 재구매"));
        acquisitionService.add(memberId, entryId, labeled("19800", "KRW", "DLC - 쿠파 왕국"));

        em.flush();
        em.clear();

        //then
        assertThat(acquisitionService.findAll(memberId, entryId))
                .extracting(Acquisition::getLabel)
                .containsExactly("스팀판", "스위치판 재구매", "DLC - 쿠파 왕국");
    }

    // ── C-3: 상태 재계산 (§7.6 완성)

    /**
     * **2026-08-26 규칙 개정.** 예전엔 NOT_OWNED만 있으면 WISHLIST였다. 그러면 에뮬로 굴릴
     * 롬을 챙겨둔 것처럼 **손에 닿는 게 분명한 것까지** 위시리스트로 갔다.
     * 위시리스트는 "아직 아무 기록도 없이 갖고 싶은 것"이어야 한다
     */
    @Test
    public void NOT_OWNED라도_취득_기록이_있으면_BACKLOG다() {
        //given
        Long entryId = givenEntry("에뮬로 굴릴 게임");

        //when
        acquisitionService.add(memberId, entryId, new AcquisitionCommand(
                AcquisitionMethod.NOT_OWNED, null, null, null, null, null, null, null));

        em.flush();
        em.clear();

        //then
        assertThat(statusOf(entryId)).isEqualTo(BacklogStatus.BACKLOG);
    }

    @Test
    public void NOT_OWNED와_구매가_섞이면_BACKLOG다() {
        //given
        Long entryId = givenEntry("Hades");
        acquisitionService.add(memberId, entryId, new AcquisitionCommand(
                AcquisitionMethod.NOT_OWNED, null, null, null, null, null, null, null));

        //when — 어느 쪽이든 취득 기록이므로 결과는 같다
        acquisitionService.add(memberId, entryId, purchased("29000", "KRW"));

        em.flush();
        em.clear();

        //then
        assertThat(statusOf(entryId)).isEqualTo(BacklogStatus.BACKLOG);
    }

    @Test
    public void 회차가_있으면_취득보다_회차가_우선한다() {
        //given — 취득만 있으면 BACKLOG
        Long entryId = givenEntry("Sekiro");
        acquisitionService.add(memberId, entryId, purchased("49000", "KRW"));

        //when — 회차를 추가한다
        playthroughService.add(memberId, entryId, new PlaythroughCommand(
                LocalDate.of(2026, 3, 1), null, PlaythroughStatus.PLAYING,
                null, null, null, null, null));

        em.flush();
        em.clear();

        //then — §7.6 우선순위: 회차 > 취득
        assertThat(statusOf(entryId)).isEqualTo(BacklogStatus.PLAYING);
    }

    // ── C-4: 수정·삭제

    @Test
    public void 취득을_NOT_OWNED로_바꿔도_BACKLOG를_유지한다() {
        //given
        Long entryId = givenEntry("Gris");
        Long acquisitionId = acquisitionService.add(memberId, entryId, purchased("19000", "KRW"));

        //when — 방식이 바뀔 뿐 취득 기록은 그대로 있다
        acquisitionService.update(memberId, acquisitionId, new AcquisitionCommand(
                AcquisitionMethod.NOT_OWNED, null, null, null, null, null, null, null));

        em.flush();
        em.clear();

        //then — WISHLIST로 돌아가려면 취득을 **지워야** 한다 (아래 테스트)
        assertThat(statusOf(entryId)).isEqualTo(BacklogStatus.BACKLOG);
    }

    @Test
    public void 마지막_취득을_지우면_WISHLIST로_되돌아간다() {
        //given
        Long entryId = givenEntry("Tunic");
        Long acquisitionId = acquisitionService.add(memberId, entryId, purchased("22000", "KRW"));
        assertThat(statusOf(entryId)).isEqualTo(BacklogStatus.BACKLOG);

        //when
        acquisitionService.delete(memberId, acquisitionId);

        em.flush();
        em.clear();

        //then
        assertThat(statusOf(entryId)).isEqualTo(BacklogStatus.WISHLIST);
        assertThat(acquisitionService.findAll(memberId, entryId)).isEmpty();
    }

    @Test
    public void 삭제된_항목에는_취득을_추가할_수_없다() {
        //given
        Long entryId = givenEntry("Limbo");
        backlogService.delete(memberId, entryId);

        //when & then
        assertThatThrownBy(() -> acquisitionService.add(memberId, entryId, purchased("10000", "KRW")))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("삭제된 항목");
    }

    @Test
    public void 금액은_소수_둘째_자리로_반올림된다() {
        //given
        Long entryId = givenEntry("Baldur's Gate 3");

        //when — Money가 setScale(2, HALF_UP) 후 범위 검증한다
        acquisitionService.add(memberId, entryId, purchased("12345.678", "KRW"));

        em.flush();
        em.clear();

        //then
        assertThat(acquisitionService.findAll(memberId, entryId).get(0).getPrice().getAmount())
                .isEqualByComparingTo("12345.68");
    }

    @Test
    public void 남의_항목에는_취득을_추가할_수_없다() {
        //given
        Long entryId = givenEntry("Stray");
        Member stranger = saveMember("stranger@example.com");

        //when & then
        assertThatThrownBy(() -> acquisitionService.add(
                stranger.getId(), entryId, purchased("10000", "KRW")))
                .isInstanceOf(NotFoundException.class);   // 남의 것은 404
    }

    // ── 헬퍼

    private BacklogStatus statusOf(Long entryId) {
        BacklogEntry entry = backlogEntryRepository.findById(entryId).orElseThrow();
        return entry.getStatus();
    }

    private Long givenEntry(String gameName) {
        Member member = saveMember("test@example.com");
        memberId = member.getId();
        Game game = Game.manual(gameName);
        gameRepository.persist(game);
        return backlogService.addToBacklog(memberId, game.getId());
    }

    private AcquisitionCommand purchased(String amount, String currency) {
        return new AcquisitionCommand(AcquisitionMethod.PURCHASED, null, null, null,
                new BigDecimal(amount), currency, LocalDate.of(2026, 1, 1), null);
    }

    private AcquisitionCommand labeled(String amount, String currency, String label) {
        return new AcquisitionCommand(AcquisitionMethod.PURCHASED, null, null, null,
                new BigDecimal(amount), currency, LocalDate.of(2026, 1, 1), label);
    }

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        return member;
    }

    private Platform savePlatform(String name) {
        Platform platform = new Platform(em.getReference(Member.class, memberId), name);
        platformRepository.persist(platform);
        return platform;
    }
}
