package com.milobeene.starlog.backlog.dto;

import com.milobeene.starlog.backlog.domain.Acquisition;
import com.milobeene.starlog.backlog.domain.AcquisitionMethod;
import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.BacklogStatus;
import com.milobeene.starlog.backlog.domain.Playthrough;
import com.milobeene.starlog.backlog.domain.PlaythroughStatus;
import com.milobeene.starlog.common.dto.MoneyResponse;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.domain.GameSource;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.subscription.domain.Subscription;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
        /** 담은 날짜. 상세 타임라인의 기점이다 (§1.3) */
        LocalDateTime createdAt,
        Resolved resolved,
        Master master,
        Overrides overrides,
        PersonalRecord personalRecord,
        /** 개인 태그. 항목당 최대 하나다 (§6.7 v1.6) */
        String tag,
        List<String> genres,          // 개인 장르 원본. 폴백 전 값이라 resolved.genres와 다를 수 있다
        List<PlaythroughItem> playthroughs,
        List<AcquisitionItem> acquisitions
) {

    /**
     * 표시값 규칙(§7.1) 7개가 전부 여기 모인다.
     *
     * **v1.7에서 커버가 여기로 들어왔다.** 그전에는 coverUrl만 밖에 따로 있고 마스터 커버는
     * master.coverImageId에 있어서, 장르는 서버가 합성하는데 커버만 화면이 합성하는 비대칭이 있었다
     */
    public record Resolved(
            String name,
            List<String> developers,
            List<String> publishers,
            LocalDate releasedOn,
            MoneyResponse listPrice,
            List<String> genres,
            Cover cover
    ) {}

    /**
     * 커버 표시값.
     *
     * URL을 서버가 확정하지 않는 이유 — 마스터 커버는 자리마다 크기가 달라야 한다
     * (목록 t_cover_small, 상세 t_cover_big_2x, 좁은 자리 t_micro, §6.10).
     * **어느 쪽이 이겼는지는 서버가 알려주고 크기 선택만 화면에 남긴다**
     */
    public record Cover(Source source, String url, String imageId) {

        public enum Source { PERSONAL, MASTER, NONE }

        static Cover of(String personalUrl, String masterImageId) {
            if (personalUrl != null) {
                return new Cover(Source.PERSONAL, personalUrl, null);
            }
            if (masterImageId != null) {
                return new Cover(Source.MASTER, null, masterImageId);
            }
            return new Cover(Source.NONE, null, null);
        }
    }

    public record Master(
            Long gameId,
            String name,
            List<String> developers,
            List<String> publishers,
            LocalDate releasedOn,
            MoneyResponse listPrice,
            List<String> genres,
            GameSource source,

            // ── v1.7 상세 화면용. 전부 표시값 규칙 밖이라 resolved에 대응 필드가 없다 (§6.2)
            String coverImageId,
            String bannerImageId,
            String summary,
            /**
             * 소개문의 한국어 번역 (2026-08-28). 없으면 null — 화면이 [번역] 버튼을 띄운다.
             *
             * ⚠️ **원문을 대체하지 않는다.** 둘 다 내려보내고 화면이 토글로 바꾼다 —
             * 번역이 이상할 때 원문을 볼 수 있어야 한다
             */
            String summaryKo,
            String storyline,
            /** 스토리라인의 한국어 번역 (2026-08-28). 소개문과 **한 묶음으로** 번역된다 */
            String storylineKo,
            BigDecimal igdbRating,
            Integer igdbRatingCount,
            List<String> releasePlatforms,
            Integer mainStoryHours,
            Integer mainExtraHours,
            Integer completionistHours,
            Integer timeToBeatSamples
    ) {}

    public record Overrides(
            String name,
            List<String> developers,
            List<String> publishers,
            LocalDate releasedOn,
            MoneyResponse listPrice
    ) {}

    public record PersonalRecord(BigDecimal rating, BigDecimal playTimeHours, String memo) {}

    /** name은 "거실 스위치 (Nintendo Switch)" 꼴이다 — 선택지 목록과 같은 문구여야 짝이 맞는다 */
    public record DeviceRef(Long deviceId, String name) {}

    public record EmulatorRef(Long emulatorId, String name) {}

    public record InputMethodRef(Long inputMethodId, String name) {}

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
            /** 어디서 했나 (v1.1). 에뮬레이터와 동시에 채워지지 않는다 */
            PlatformRef platform,
            PlatformAccountRef platformAccount,
            EmulatorRef emulator,
            InputMethodRef inputMethod
    ) {

        static PlaythroughItem from(Playthrough p) {
            return new PlaythroughItem(
                    p.getId(), p.getSequenceNo(), p.getStartedOn(), p.getFinishedOn(),
                    p.getStatus(), p.getLabel(),
                    p.getDevice() == null ? null
                            : new DeviceRef(p.getDevice().getId(), p.getDevice().optionLabel()),
                    p.getPlatform() == null ? null
                            : new PlatformRef(p.getPlatform().getId(), p.getPlatform().getName()),
                    PlatformAccountRef.from(p.getPlatformAccount()),
                    p.getEmulator() == null ? null
                            : new EmulatorRef(p.getEmulator().getId(), p.getEmulator().getName()),
                    p.getInputMethod() == null ? null
                            : new InputMethodRef(p.getInputMethod().getId(), p.getInputMethod().getName()));
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
     * 회차·취득을 인자로 받는 이유 — 엔티티의 LAZY 컬렉션을 그냥 훑으면
     * 회차마다 기기·계정·에뮬 쿼리가 따라붙는다. 조회 전용 서비스가 join fetch로
     * 미리 뽑아서 넘긴다 (쿼리 개수를 DTO가 아니라 서비스가 통제한다).
     *
     * 컬렉션 복사는 엔티티의 resolved*·getter가 책임진다 — DTO는 감쌀 필요가 없다
     */
    public static BacklogDetailResponse from(BacklogEntry entry, String coverUrl,
                                             List<Playthrough> playthroughs,
                                             List<Acquisition> acquisitions) {
        Game game = entry.getGame();

        return new BacklogDetailResponse(
                entry.getId(),
                entry.getStatus(),
                entry.getCreatedAt(),
                new Resolved(
                        entry.getDisplayName(),
                        entry.resolvedDevelopers(),
                        entry.resolvedPublishers(),
                        entry.resolvedReleasedOn(),
                        MoneyResponse.from(entry.resolvedListPrice()),
                        entry.resolvedGenres(),
                        Cover.of(coverUrl, game.getCoverImageId())),
                new Master(
                        game.getId(), game.getName(),
                        game.getDevelopers(), game.getPublishers(),
                        game.getReleasedOn(), MoneyResponse.from(game.getListPrice()),
                        game.getMasterGenres(), game.getSource(),
                        game.getCoverImageId(), game.getBannerImageId(),
                        game.getSummary(), game.getSummaryKo(),
                        game.getStoryline(), game.getStorylineKo(),
                        game.getIgdbRating(), game.getIgdbRatingCount(),
                        game.getReleasePlatforms(),
                        game.getMainStoryHours(), game.getMainExtraHours(),
                        game.getCompletionistHours(), game.getTimeToBeatSamples()),
                new Overrides(
                        entry.getNameOverride(),
                        entry.getDeveloperOverrides(), entry.getPublisherOverrides(),
                        entry.getReleasedOnOverride(),
                        MoneyResponse.from(entry.getListPriceOverride())),
                new PersonalRecord(entry.getRating(), entry.getPlayTimeHours(), entry.getMemo()),
                entry.getTag() == null ? null : entry.getTag().getName(),
                entry.getGenreLinks().stream().map(link -> link.getGenre().getName()).toList(),
                playthroughs.stream().map(PlaythroughItem::from).toList(),
                acquisitions.stream().map(AcquisitionItem::from).toList()
        );
    }
}
