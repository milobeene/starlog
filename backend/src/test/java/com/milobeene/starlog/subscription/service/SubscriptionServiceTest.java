package com.milobeene.starlog.subscription.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.milobeene.starlog.backlog.domain.Acquisition;
import com.milobeene.starlog.backlog.domain.AcquisitionCommand;
import com.milobeene.starlog.backlog.domain.AcquisitionMethod;
import com.milobeene.starlog.backlog.service.AcquisitionService;
import com.milobeene.starlog.backlog.service.BacklogService;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.subscription.domain.BillingCycle;
import com.milobeene.starlog.subscription.domain.Subscription;
import com.milobeene.starlog.subscription.domain.SubscriptionCommand;
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
class SubscriptionServiceTest {

    @Autowired SubscriptionService subscriptionService;
    @Autowired AcquisitionService acquisitionService;
    @Autowired BacklogService backlogService;
    @Autowired GameRepository gameRepository;
    @Autowired EntityManager em;

    private Long memberId;

    // ── F-1: CRUD

    @Test
    public void 구독을_등록할_수_있다() {
        //given
        givenMember();

        //when
        Long id = subscriptionService.register(memberId, new SubscriptionCommand(
                "  Xbox Game Pass  ", LocalDate.of(2026, 1, 1), null,
                new BigDecimal("11900"), "KRW", BillingCycle.MONTHLY));

        em.flush();
        em.clear();

        //then
        Subscription found = subscriptionService.findOwned(memberId, id);
        assertThat(found.getServiceName()).isEqualTo("Xbox Game Pass");   // strip 적용
        assertThat(found.getFee().getAmount()).isEqualByComparingTo("11900");
        assertThat(found.isActive()).isTrue();   // 종료일 null = 구독 중
    }

    @Test
    public void 종료일이_시작일보다_빠르면_예외가_발생한다() {
        //given
        givenMember();

        //when & then — 회차의 BR-PT-01과 같은 규칙
        assertThatThrownBy(() -> subscriptionService.register(memberId, new SubscriptionCommand(
                "PS Plus", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 1, 1),
                null, null, BillingCycle.YEARLY)))
                .isInstanceOf(InvalidInputException.class);
    }

    @Test
    public void 구독을_종료하면_활성이_아니게_된다() {
        //given
        givenMember();
        Long id = subscriptionService.register(memberId, monthly("PS Plus", null));

        //when
        subscriptionService.update(memberId, id, new SubscriptionCommand(
                "PS Plus", LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31),
                new BigDecimal("9900"), "KRW", BillingCycle.MONTHLY));

        em.flush();
        em.clear();

        //then
        assertThat(subscriptionService.findOwned(memberId, id).isActive()).isFalse();
    }

    @Test
    public void 구독은_물리_삭제된다() {
        //given
        givenMember();
        Long id = subscriptionService.register(memberId, monthly("Nintendo Online", null));

        //when
        subscriptionService.delete(memberId, id);

        em.flush();
        em.clear();

        //then
        assertThat(subscriptionService.findAll(memberId)).isEmpty();
    }

    @Test
    public void 남의_구독은_건드릴_수_없다() {
        //given
        givenMember();
        Long id = subscriptionService.register(memberId, monthly("PS Plus", null));
        Member stranger = saveMember("stranger@example.com");

        //when & then
        assertThatThrownBy(() -> subscriptionService.delete(stranger.getId(), id))
                .isInstanceOf(NotFoundException.class);
    }

    // ── F-2: 취득 연결

    @Test
    public void 구독_취득에_구독을_연결할_수_있다() {
        //given
        givenMember();
        Long subscriptionId = subscriptionService.register(memberId, monthly("Xbox Game Pass", null));
        Long entryId = givenEntry("Halo Infinite");

        //when — FR-ACQ-05
        acquisitionService.add(memberId, entryId, new AcquisitionCommand(
                AcquisitionMethod.SUBSCRIPTION, null, null, subscriptionId,
                null, null, LocalDate.of(2026, 2, 1), null));

        em.flush();
        em.clear();

        //then
        Acquisition found = acquisitionService.findAll(memberId, entryId).get(0);
        assertThat(found.getSubscription().getServiceName()).isEqualTo("Xbox Game Pass");
    }

    @Test
    public void 구독_방식이_아닌데_구독을_연결하면_예외가_발생한다() {
        //given
        givenMember();
        Long subscriptionId = subscriptionService.register(memberId, monthly("Xbox Game Pass", null));
        Long entryId = givenEntry("Elden Ring");

        //when & then — 모순은 막는다
        assertThatThrownBy(() -> acquisitionService.add(memberId, entryId, new AcquisitionCommand(
                AcquisitionMethod.PURCHASED, null, null, subscriptionId,
                new BigDecimal("59000"), "KRW", null, null)))
                .isInstanceOf(InvalidInputException.class)
                .hasMessageContaining("SUBSCRIPTION");
    }

    @Test
    public void 구독_방식인데_연결이_없어도_허용된다() {
        //given — 제약 최소화 방침
        givenMember();
        Long entryId = givenEntry("Forza Horizon");

        //when
        acquisitionService.add(memberId, entryId, new AcquisitionCommand(
                AcquisitionMethod.SUBSCRIPTION, null, null, null,
                null, null, null, null));

        em.flush();
        em.clear();

        //then
        assertThat(acquisitionService.findAll(memberId, entryId).get(0).getSubscription()).isNull();
    }

    @Test
    public void 남의_구독은_연결할_수_없다() {
        //given
        givenMember();
        Long entryId = givenEntry("Starfield");

        Member stranger = saveMember("stranger@example.com");
        Long strangerSubscription = subscriptionService.register(
                stranger.getId(), monthly("Xbox Game Pass", null));

        //when & then
        assertThatThrownBy(() -> acquisitionService.add(memberId, entryId, new AcquisitionCommand(
                AcquisitionMethod.SUBSCRIPTION, null, null, strangerSubscription,
                null, null, null, null)))
                .isInstanceOf(NotFoundException.class);
    }

    // ── 헬퍼

    private void givenMember() {
        memberId = saveMember("test@example.com").getId();
    }

    private Long givenEntry(String gameName) {
        Game game = Game.manual(gameName);
        gameRepository.persist(game);
        return backlogService.addToBacklog(memberId, game.getId());
    }

    private SubscriptionCommand monthly(String serviceName, LocalDate endedOn) {
        return new SubscriptionCommand(serviceName, LocalDate.of(2026, 1, 1), endedOn,
                new BigDecimal("9900"), "KRW", BillingCycle.MONTHLY);
    }

    private Member saveMember(String email) {
        Member member = Member.signUpWithEmail(email, "1111", "테스터");
        em.persist(member);
        return member;
    }
}
