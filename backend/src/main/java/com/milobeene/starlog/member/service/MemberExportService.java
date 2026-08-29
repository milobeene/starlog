package com.milobeene.starlog.member.service;

import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.Playthrough;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.backlog.repository.AcquisitionRepository;
import com.milobeene.starlog.backlog.repository.BacklogEntryGenreRepository;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.backlog.repository.CoverImageRepository;
import com.milobeene.starlog.backlog.repository.PlaythroughRepository;
import com.milobeene.starlog.common.entity.Money;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.common.util.AppClock;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.dto.MemberExport;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.platform.repository.DeviceRepository;
import com.milobeene.starlog.platform.repository.EmulatorRepository;
import com.milobeene.starlog.platform.repository.InputMethodRepository;
import com.milobeene.starlog.platform.repository.PlatformAccountRepository;
import com.milobeene.starlog.platform.repository.PlatformRepository;
import com.milobeene.starlog.subscription.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * 회원 데이터 내보내기 (v1.0 작업순서 0번).
 *
 * **전부 한 트랜잭션 안에서 DTO로 바꿔 끝낸다** — `open-in-view: false`라 밖에서 LAZY를
 * 건드리면 터진다 (CLAUDE.md JPA 3번).
 *
 * 항목마다 회차·취득·장르를 따로 읽는다. 항목이 76개면 쿼리가 200번대로 늘지만,
 * **이건 하루에 한 번 도는 백업이지 화면 조회가 아니다.** 컬렉션 페치 조인을 여러 개
 * 겹치면 카테시안 곱이 되고(JPA 4번), 그걸 피하려고 배치로 모으면 코드가 두 배가 된다.
 * 정확함이 속도보다 중요한 자리다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberExportService {

    private final MemberRepository memberRepository;
    private final BacklogEntryRepository backlogEntryRepository;
    private final PlaythroughRepository playthroughRepository;
    private final AcquisitionRepository acquisitionRepository;
    private final BacklogEntryGenreRepository genreLinkRepository;
    private final CoverImageRepository coverImageRepository;
    private final PlatformRepository platformRepository;
    private final PlatformAccountRepository platformAccountRepository;
    private final DeviceRepository deviceRepository;
    private final EmulatorRepository emulatorRepository;
    private final InputMethodRepository inputMethodRepository;
    private final SubscriptionRepository subscriptionRepository;

    public MemberExport export(Long memberId) {
        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));

        List<BacklogEntry> entries = backlogEntryRepository.findAllForExport(memberId);

        /*
         * 마스터 게임을 모을 때 **중복을 제거한다** — 여러 항목이 같은 게임을 가리킬 수는
         * 없지만(uk_backlog_member_game), 병합 이력이 있으면 이론상 가능하다.
         * LinkedHashMap이라 순서도 안정적이다
         */
        Map<String, MemberExport.Game> games = new LinkedHashMap<>();
        List<MemberExport.Entry> exported = new ArrayList<>();

        // 태그·장르는 항목이 실제로 쓰는 것만 모은다 — 안 쓰는 사전 행은 조회에서 이미
        // 안 보이고(§6.7 자동 소멸), 가져오기가 find-or-create라 어차피 다시 생긴다
        TreeSet<String> usedTags = new TreeSet<>();
        TreeSet<String> usedGenres = new TreeSet<>();

        for (BacklogEntry entry : entries) {
            Game game = entry.getGame();
            String key = gameKeyOf(game);
            games.putIfAbsent(key, toGame(game));

            List<String> genres = genreLinkRepository.findByBacklogEntryId(entry.getId()).stream()
                    .map(link -> link.getGenre().getName())
                    .toList();
            usedGenres.addAll(genres);

            String tag = entry.getTag() == null ? null : entry.getTag().getName();
            if (tag != null) {
                usedTags.add(tag);
            }

            exported.add(new MemberExport.Entry(
                    key,
                    entry.getCreatedAt(),
                    entry.getDeletedAt(),
                    entry.getNameOverride(),
                    List.copyOf(entry.getDeveloperOverrides()),
                    List.copyOf(entry.getPublisherOverrides()),
                    entry.getReleasedOnOverride(),
                    money(entry.getListPriceOverride()),
                    entry.getRating(),
                    entry.getPlayTimeHours(),
                    entry.getMemo(),
                    tag,
                    genres,
                    cover(entry.getId()),
                    playthroughs(entry.getId()),
                    acquisitions(entry.getId())));
        }

        return new MemberExport(
                MemberExport.FORMAT_VERSION,
                LocalDateTime.now(AppClock.ZONE),
                profile(member),
                catalog(memberId, List.copyOf(usedTags), List.copyOf(usedGenres)),
                List.copyOf(games.values()),
                exported);
    }

    /** IGDB id가 있으면 그것, 없으면(수동 등록) 이름. 새 DB에서 항목이 게임을 찾는 열쇠다 */
    static String gameKeyOf(Game game) {
        return game.getExternalId() != null ? "igdb:" + game.getExternalId() : "name:" + game.getName();
    }

    private MemberExport.Profile profile(Member member) {
        // 자격증명은 담지 않는다 — MemberExport 클래스 주석 참고
        String colors = member.getBackgroundColors();
        return new MemberExport.Profile(
                member.getEmail(), member.getNickname(), member.getMemo(),
                colors == null ? null : List.of(colors.split(",")));
    }

    private MemberExport.Catalog catalog(Long memberId, List<String> tags, List<String> genres) {
        return new MemberExport.Catalog(
                platformRepository.findByMemberIdAndDeletedAtIsNullOrderByNameAsc(memberId).stream()
                        .map(p -> p.getName()).toList(),
                platformAccountRepository.findSelectable(memberId).stream()
                        .map(a -> new MemberExport.Account(a.getAccountLabel(), a.getPlatform().getName()))
                        .toList(),
                deviceRepository.findByMemberIdAndDeletedAtIsNullOrderByLabelAsc(memberId).stream()
                        .map(d -> new MemberExport.Device(d.getDeviceType(), d.getLabel(), d.getMemo()))
                        .toList(),
                emulatorRepository.findByMemberIdAndDeletedAtIsNullOrderByNameAsc(memberId).stream()
                        .map(e -> new MemberExport.NamedMemo(e.getName(), e.getMemo()))
                        .toList(),
                inputMethodRepository.findByMemberIdAndDeletedAtIsNullOrderByNameAsc(memberId).stream()
                        .map(i -> i.getName()).toList(),
                subscriptionRepository.findByMemberIdOrderByStartedOnDesc(memberId).stream()
                        .map(s -> new MemberExport.Subscription(
                                s.getServiceName(), s.getStartedOn(), s.getEndedOn(),
                                money(s.getFee()), s.getBillingCycle().name()))
                        .toList(),
                tags,
                genres);
    }

    private MemberExport.Game toGame(Game game) {
        return new MemberExport.Game(
                game.getExternalId(), game.getSource().name(), game.getName(),
                List.copyOf(game.getDevelopers()), List.copyOf(game.getPublishers()),
                List.copyOf(game.getMasterGenres()),
                game.getReleasedOn(), money(game.getListPrice()),
                game.getCoverImageId(), game.getBannerImageId(),
                game.getSummary(), game.getStoryline(),
                game.getIgdbRating(), game.getIgdbRatingCount(),
                List.copyOf(game.getReleasePlatforms()),
                game.getMainStoryHours(), game.getMainExtraHours(),
                game.getCompletionistHours(), game.getTimeToBeatSamples(),
                game.getMediaFolder());
    }

    private MemberExport.Cover cover(Long entryId) {
        return coverImageRepository.findByBacklogEntryId(entryId)
                .map(c -> new MemberExport.Cover(c.getStorageKey(), c.getContentType(),
                        c.getSizeBytes(), c.getLocation().name()))
                .orElse(null);
    }

    private List<MemberExport.Playthrough> playthroughs(Long entryId) {
        return playthroughRepository.findAllWithReferences(entryId).stream()
                .map(p -> new MemberExport.Playthrough(
                        p.getSequenceNo(), p.getStartedOn(), p.getFinishedOn(),
                        p.getStatus().name(), p.getLabel(),
                        p.getDevice() == null ? null : p.getDevice().getLabel(),
                        accountLabel(p),
                        ownerName(p.getPlatformAccount()),
                        p.getEmulator() == null ? null : p.getEmulator().getName(),
                        p.getInputMethod() == null ? null : p.getInputMethod().getName()))
                .toList();
    }

    private List<MemberExport.Acquisition> acquisitions(Long entryId) {
        return acquisitionRepository.findAllWithReferences(entryId).stream()
                .map(a -> new MemberExport.Acquisition(
                        a.getMethod().name(),
                        a.getPlatform() == null ? null : a.getPlatform().getName(),
                        a.getPlatformAccount() == null ? null : a.getPlatformAccount().getAccountLabel(),
                        ownerName(a.getPlatformAccount()),
                        a.getSubscription() == null ? null : a.getSubscription().getServiceName(),
                        money(a.getPrice()), a.getAcquiredOn(), a.getLabel()))
                .toList();
    }

    /**
     * 계정의 소속 이름 — **라벨만으로는 계정을 못 집기 때문에 함께 적는다** (형식 2).
     *
     * 계정은 플랫폼이거나 에뮬이거나 하나다 (V11). `ownerName()`이 그 하나를 준다
     */
    private static String ownerName(PlatformAccount account) {
        return account == null ? null : account.ownerName();
    }

    private static String accountLabel(Playthrough p) {
        return p.getPlatformAccount() == null ? null : p.getPlatformAccount().getAccountLabel();
    }

    private static MemberExport.Money money(Money money) {
        return money == null ? null : new MemberExport.Money(money.getAmount(), money.getCurrency());
    }
}
