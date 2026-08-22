package com.milobeene.gamebacklog.backlog.dto;

import com.milobeene.gamebacklog.backlog.domain.Acquisition;
import com.milobeene.gamebacklog.backlog.domain.AcquisitionMethod;
import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.domain.BacklogStatus;
import com.milobeene.gamebacklog.backlog.domain.InputMethod;
import com.milobeene.gamebacklog.backlog.domain.Playthrough;
import com.milobeene.gamebacklog.backlog.domain.PlaythroughStatus;
import com.milobeene.gamebacklog.common.dto.MoneyResponse;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.domain.GameSource;
import com.milobeene.gamebacklog.platform.domain.PlatformAccount;
import com.milobeene.gamebacklog.subscription.domain.Subscription;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 상세 (화면 2, API 설계서 §1.3).
 *
 * 표시값(resolved)과 마스터 원본을 둘 다 준다. 편집 화면이 "내가 뭘 덮어썼는지"를
 * 보여줘야 하기 때문이다. overrides는 폼의 현재 입력값 — 스칼라 null / 리스트 []가 "안 덮어씀"
 */
public record BacklogDetailResponse(
        Long entryId,
        BacklogStatus status,
        String coverUrl,
        Resolved resolved,
        Master master,
        Overrides overrides,
        PersonalRecord personalRecord,
        List<String> tags,
        List<String> genres,          // 개인 장르 원본. 폴백 전 값이라 resolved.genres와 다를 수 있다
        List<PlaythroughItem> playthroughs,
        List<AcquisitionItem> acquisitions
) {

    public record Resolved(
            String name,
            List<String> developers,
            List<String> publishers,
            LocalDate releasedOn,
            MoneyResponse listPrice,
            List<String> genres
    ) {}

    public record Master(
            Long gameId,
            String name,
            List<String> developers,
            List<String> publishers,
            LocalDate releasedOn,
            MoneyResponse listPrice,
            List<String> genres,
            GameSource source,
            // RAWG playtime. 오버라이드가 없어서 resolved에는 대응 필드가 없다 (§6.2)
            Integer averagePlaytimeHours
    ) {}

    public record Overrides(
            String name,
            List<String> developers,
            List<String> publishers,
            LocalDate releasedOn,
            MoneyResponse listPrice
    ) {}

    public record PersonalRecord(BigDecimal rating, Integer playTimeHours, String memo) {}

    public record DeviceRef(Long deviceId, String name) {}

    public record EmulatorRef(Long emulatorId, String name) {}

    public record PlatformRef(Long platformId, String name) {}

    /** 삭제된 계정도 그대로 실린다. 과거 기록에서는 계정 이름이 계속 보여야 한다 (§6.5) */
    public record PlatformAccountRef(Long accountId, String label) {

        static PlatformAccountRef from(PlatformAccount account) {
            return account == null ? null
                    : new PlatformAccountRef(account.getId(), account.getAccountLabel());
        }
    }

    public record SubscriptionRef(Long subscriptionId, String serviceName) {

        static SubscriptionRef from(Subscription subscription) {
            return subscription == null ? null
                    : new SubscriptionRef(subscription.getId(), subscription.getServiceName());
        }
    }

    public record PlaythroughItem(
            Long playthroughId,
            int sequenceNo,
            LocalDate startedOn,
            LocalDate finishedOn,
            PlaythroughStatus status,
            String label,
            DeviceRef device,
            PlatformAccountRef platformAccount,
            EmulatorRef emulator,
            InputMethod inputMethod
    ) {

        static PlaythroughItem from(Playthrough p) {
            return new PlaythroughItem(
                    p.getId(), p.getSequenceNo(), p.getStartedOn(), p.getFinishedOn(),
                    p.getStatus(), p.getLabel(),
                    p.getDevice() == null ? null
                            : new DeviceRef(p.getDevice().getId(), p.getDevice().getName()),
                    PlatformAccountRef.from(p.getPlatformAccount()),
                    p.getEmulator() == null ? null
                            : new EmulatorRef(p.getEmulator().getId(), p.getEmulator().getName()),
                    p.getInputMethod());
        }
    }

    public record AcquisitionItem(
            Long acquisitionId,
            AcquisitionMethod method,
            PlatformRef platform,
            PlatformAccountRef platformAccount,
            SubscriptionRef subscription,
            MoneyResponse price,
            LocalDate acquiredOn,
            String label
    ) {

        static AcquisitionItem from(Acquisition a) {
            return new AcquisitionItem(
                    a.getId(), a.getMethod(),
                    a.getPlatform() == null ? null
                            : new PlatformRef(a.getPlatform().getId(), a.getPlatform().getName()),
                    PlatformAccountRef.from(a.getPlatformAccount()),
                    SubscriptionRef.from(a.getSubscription()),
                    MoneyResponse.from(a.getPrice()),
                    a.getAcquiredOn(), a.getLabel());
        }
    }

    /**
     * 회차·취득·태그를 인자로 받는 이유 — 엔티티의 LAZY 컬렉션을 그냥 훑으면
     * 회차마다 기기·계정·에뮬 쿼리가 따라붙는다. 조회 전용 서비스가 join fetch로
     * 미리 뽑아서 넘긴다 (쿼리 개수를 DTO가 아니라 서비스가 통제한다).
     *
     * 컬렉션 복사는 엔티티의 resolved*·getter가 책임진다 — DTO는 감쌀 필요가 없다
     */
    public static BacklogDetailResponse from(BacklogEntry entry,
                                             List<String> tagNames,
                                             List<Playthrough> playthroughs,
                                             List<Acquisition> acquisitions) {
        Game game = entry.getGame();

        return new BacklogDetailResponse(
                entry.getId(),
                entry.getStatus(),
                null,   // 커버는 Phase 5 (K)
                new Resolved(
                        entry.getDisplayName(),
                        entry.resolvedDevelopers(),
                        entry.resolvedPublishers(),
                        entry.resolvedReleasedOn(),
                        MoneyResponse.from(entry.resolvedListPrice()),
                        entry.resolvedGenres()),
                new Master(
                        game.getId(), game.getName(),
                        game.getDevelopers(), game.getPublishers(),
                        game.getReleasedOn(), MoneyResponse.from(game.getListPrice()),
                        game.getMasterGenres(), game.getSource(),
                        game.getAveragePlaytimeHours()),
                new Overrides(
                        entry.getNameOverride(),
                        entry.getDeveloperOverrides(), entry.getPublisherOverrides(),
                        entry.getReleasedOnOverride(),
                        MoneyResponse.from(entry.getListPriceOverride())),
                new PersonalRecord(entry.getRating(), entry.getPlayTimeHours(), entry.getMemo()),
                tagNames,
                entry.getGenreLinks().stream().map(link -> link.getGenre().getName()).toList(),
                playthroughs.stream().map(PlaythroughItem::from).toList(),
                acquisitions.stream().map(AcquisitionItem::from).toList()
        );
    }
}
