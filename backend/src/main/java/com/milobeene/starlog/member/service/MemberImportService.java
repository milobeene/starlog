package com.milobeene.starlog.member.service;

import com.milobeene.starlog.backlog.domain.Acquisition;
import com.milobeene.starlog.backlog.domain.AcquisitionCommand;
import com.milobeene.starlog.backlog.domain.AcquisitionMethod;
import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.BacklogEntryGenre;
import com.milobeene.starlog.backlog.domain.CoverImage;
import com.milobeene.starlog.backlog.domain.CoverLocation;
import com.milobeene.starlog.common.storage.LocalFileStore;
import com.milobeene.starlog.common.storage.MediaPaths;
import com.milobeene.starlog.backlog.domain.OverrideCommand;
import com.milobeene.starlog.backlog.domain.Playthrough;
import com.milobeene.starlog.backlog.domain.PlaythroughCommand;
import com.milobeene.starlog.backlog.domain.PlaythroughStatus;
import com.milobeene.starlog.backlog.repository.AcquisitionRepository;
import com.milobeene.starlog.backlog.repository.BacklogEntryGenreRepository;
import com.milobeene.starlog.backlog.repository.BacklogEntryRepository;
import com.milobeene.starlog.backlog.repository.CoverImageRepository;
import com.milobeene.starlog.backlog.repository.PlaythroughRepository;
import com.milobeene.starlog.common.entity.Money;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.InvalidInputException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.game.domain.CatalogSyncCommand;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.domain.GameSource;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.dto.MemberExport;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.platform.domain.Device;
import com.milobeene.starlog.platform.domain.Emulator;
import com.milobeene.starlog.platform.domain.InputMethod;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.domain.PlatformAccount;
import com.milobeene.starlog.platform.repository.DeviceRepository;
import com.milobeene.starlog.platform.repository.EmulatorRepository;
import com.milobeene.starlog.platform.repository.InputMethodRepository;
import com.milobeene.starlog.platform.repository.PlatformAccountRepository;
import com.milobeene.starlog.platform.repository.PlatformRepository;
import com.milobeene.starlog.subscription.domain.BillingCycle;
import com.milobeene.starlog.subscription.domain.Subscription;
import com.milobeene.starlog.subscription.domain.SubscriptionCommand;
import com.milobeene.starlog.subscription.repository.SubscriptionRepository;
import com.milobeene.starlog.tag.domain.Genre;
import com.milobeene.starlog.tag.domain.Tag;
import com.milobeene.starlog.tag.repository.GenreRepository;
import com.milobeene.starlog.tag.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 회원 데이터 가져오기 (v1.0 작업순서 0번).
 *
 * ## 빈 회원에만 넣는다
 * 병합은 거부한다(409). "같은 항목인가"를 판정해야 하는데 — 같은 게임의 회차 두 벌이
 * 같은 것인지 다른 것인지 알 방법이 없다 — 그 문제가 이 작업 전체보다 크다.
 * **복원은 갈아끼우는 것이지 합치는 것이 아니다.**
 *
 * ## 순서가 전부다
 * `마스터 게임 → 플랫폼 → 계정 → 기기·에뮬·입력방식 → 구독 → 태그·장르 → 항목 →
 * 회차·취득·커버 → 파생 상태 재계산`
 *
 * 계정이 플랫폼을 참조하므로 플랫폼이 먼저고, 회차가 기기·계정을 참조하므로 그것들이 먼저다.
 *
 * ## 파생 상태는 다시 계산한다
 * `status`·`displayName`·`lastPlayedOn`·`lastPlaythrough`·`releasedOnResolved`는
 * 내보내기가 담지 않는다(두 개의 진실을 만들지 않으려고). **맨 끝에 반드시 다시 돌려야 한다** —
 * 안 그러면 전 항목이 위시리스트에 이름 없이 들어온다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MemberImportService {

    private final MemberRepository memberRepository;
    private final GameRepository gameRepository;
    private final BacklogEntryRepository backlogEntryRepository;
    private final PlaythroughRepository playthroughRepository;
    private final AcquisitionRepository acquisitionRepository;
    private final BacklogEntryGenreRepository genreLinkRepository;
    private final CoverImageRepository coverImageRepository;
    /* 로컬 커버는 실물이 있어야 붙인다 — 이 JSON은 다른 기계로 건너갈 수 있다 */
    private final LocalFileStore localFileStore;
    private final MediaPaths mediaPaths;
    private final PlatformRepository platformRepository;
    private final PlatformAccountRepository platformAccountRepository;
    private final DeviceRepository deviceRepository;
    private final EmulatorRepository emulatorRepository;
    private final InputMethodRepository inputMethodRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final TagRepository tagRepository;
    private final GenreRepository genreRepository;

    public record Result(int games, int entries, int playthroughs, int acquisitions) {}

    @Transactional
    public Result importInto(Long memberId, MemberExport data) {
        if (data == null || data.entries() == null) {
            throw new InvalidInputException("가져올 데이터가 비어 있습니다");
        }
        if (data.formatVersion() != MemberExport.FORMAT_VERSION) {
            throw new InvalidInputException(
                    "지원하지 않는 백업 형식입니다. 이 버전은 %d를 읽습니다 (파일은 %d)"
                            .formatted(MemberExport.FORMAT_VERSION, data.formatVersion()));
        }

        Member member = memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));

        /*
         * **삭제된 것까지 센다.** 눈에 안 보이는 항목이 남아 있는데 덮어쓰면
         * 같은 게임이 두 벌이 되어 유니크 제약에 걸린다
         */
        if (!backlogEntryRepository.findAllForExport(memberId).isEmpty()) {
            throw new ConflictException("이미 데이터가 있는 계정입니다. 빈 계정에만 가져올 수 있습니다");
        }

        Map<String, Game> games = importGames(data.games());
        Catalog catalog = importCatalog(member, data.catalog());
        importProfile(member, data.profile());

        int playthroughs = 0;
        int acquisitions = 0;
        for (MemberExport.Entry item : data.entries()) {
            Game game = games.get(item.gameKey());
            if (game == null) {
                throw new InvalidInputException(
                        "항목이 가리키는 게임이 백업에 없습니다: " + item.gameKey());
            }
            BacklogEntry entry = importEntry(member, game, item, catalog);
            playthroughs += item.playthroughs() == null ? 0 : item.playthroughs().size();
            acquisitions += item.acquisitions() == null ? 0 : item.acquisitions().size();

            /*
             * **여기서 파생 상태를 다시 만든다.** 회차·취득을 다 붙인 다음이어야 한다 —
             * 순서가 바뀌면 status가 위시리스트로 굳는다
             */
            entry.refreshDisplayName();
            entry.refreshReleasedOn();
            entry.syncDerivedState();
        }

        log.info("가져오기 완료 — 게임 {} / 항목 {} / 회차 {} / 취득 {}",
                games.size(), data.entries().size(), playthroughs, acquisitions);

        return new Result(games.size(), data.entries().size(), playthroughs, acquisitions);
    }

    /* ── 마스터 게임 ──────────────────────────────────────── */

    /**
     * 이미 있으면 그대로 쓴다. 마스터는 **공용 데이터**라 회원 소유가 아니다 —
     * 다른 회원이 이미 담은 게임이면 그 행을 그대로 가리키는 게 맞다
     */
    private Map<String, Game> importGames(List<MemberExport.Game> exported) {
        Map<String, Game> byKey = new HashMap<>();
        if (exported == null) {
            return byKey;
        }

        for (MemberExport.Game item : exported) {
            Game game = findExisting(item).orElseGet(() -> create(item));
            byKey.put(keyOf(item), game);
        }
        return byKey;
    }

    /**
     * 이미 있으면 그 행을 쓴다. IGDB 게임은 `externalId`로, 수동 등록은 이름으로 찾는다.
     * 수동 등록의 이름 조회가 부분 일치 검색을 재활용하는 이유 — 정확 일치 전용 메서드가
     * 없고, 여기서만 쓰자고 하나 더 만들 값을 못 한다. 대신 **결과를 정확 일치로 거른다**
     */
    private java.util.Optional<Game> findExisting(MemberExport.Game item) {
        if (item.externalId() != null) {
            return gameRepository.findBySourceAndExternalId(GameSource.IGDB, item.externalId());
        }
        return gameRepository.searchByName(item.name(), PageRequest.ofSize(20)).stream()
                .filter(g -> g.getSource() == GameSource.MANUAL && g.getName().equalsIgnoreCase(item.name()))
                .findFirst();
    }

    private Game create(MemberExport.Game item) {
        Game game = item.externalId() != null
                ? Game.fromCatalog(item.name(), item.externalId(), null)
                : Game.manual(item.name());
        gameRepository.persist(game);

        /*
         * 스크린샷 폴더 이름을 먼저 되살린다. 안 하면 파일은 `media/<slug>/`에 그대로 있는데
         * 새 게임이 그 이름을 몰라 **첫 저장 때 새 폴더를 만든다** — 이름이 겹쳐 번호가
         * 붙었던 폴더는 영영 못 찾는다. 옛 파일에는 이 칸이 없어서 null이면 건너뛴다
         */
        if (item.mediaFolder() != null) {
            game.assignMediaFolder(item.mediaFolder());
        }

        /*
         * 둘로 나눠 채운다 — `syncFromCatalog`가 **일부러 listPrice를 안 건드린다**(§6.2).
         * 외부 DB는 가격을 안 주므로, 손으로 넣은 정가가 재동기화 때 날아가지 않게 하려는 것이다.
         * 복원은 그 정가까지 되살려야 하므로 updateMasterInfo로 한 번 더 덮는다
         */
        game.syncFromCatalog(new CatalogSyncCommand(
                item.developers(), item.publishers(), item.masterGenres(), item.releasedOn(),
                item.coverImageId(), item.bannerImageId(),
                item.summary(), item.storyline(),
                item.igdbRating(), item.igdbRatingCount(),
                item.releasePlatforms(),
                item.mainStoryHours(), item.mainExtraHours(),
                item.completionistHours(), item.timeToBeatSamples()), null);

        game.updateMasterInfo(item.developers(), item.publishers(), item.masterGenres(),
                item.releasedOn(), money(item.listPrice()));
        return game;
    }

    private static String keyOf(MemberExport.Game item) {
        return item.externalId() != null ? "igdb:" + item.externalId() : "name:" + item.name();
    }

    /* ── 선택지 ──────────────────────────────────────────── */

    /** 이름 → 엔티티. 회차·취득이 이름으로 참조를 잇는다 */
    private record Catalog(Map<String, Platform> platforms,
                           Map<String, PlatformAccount> accounts,
                           Map<String, Device> devices,
                           Map<String, Emulator> emulators,
                           Map<String, InputMethod> inputMethods,
                           Map<String, Subscription> subscriptions,
                           Map<String, Tag> tags,
                           Map<String, Genre> genres) {}

    private Catalog importCatalog(Member member, MemberExport.Catalog data) {
        Catalog catalog = new Catalog(new HashMap<>(), new HashMap<>(), new HashMap<>(),
                new HashMap<>(), new HashMap<>(), new HashMap<>(), new HashMap<>(), new HashMap<>());
        if (data == null) {
            return catalog;
        }

        /*
         * 플랫폼이 먼저다 — 계정이 이걸 참조한다.
         *
         * ⚠️ **이미 있으면 그 행을 다시 쓴다.** v1.0에는 가입이 없어서 주인 계정이
         * `DefaultCatalogSeeder`가 넣은 기본 플랫폼(Steam·Epic…)을 **항상 갖고 시작한다.**
         * 무조건 만들면 `uk_platform_member_name`에 걸려 **가져오기가 통째로 실패한다** —
         * 실제로 그랬고, 빈 앱에서는 가져오기가 아예 불가능했다.
         *
         * 마스터 게임을 이름으로 잇는 것과 같은 규칙이다 (§ "참조를 잇는 방식")
         */
        each(data.platforms(), name -> catalog.platforms().put(name,
                platformRepository.findByMemberIdAndName(member.getId(), name)
                        .orElseGet(() -> {
                            Platform created = new Platform(member, name);
                            platformRepository.persist(created);
                            return created;
                        })));

        each(data.accounts(), item -> {
            Platform platform = catalog.platforms().get(item.platform());
            if (platform == null) {
                throw new InvalidInputException("계정이 가리키는 플랫폼이 백업에 없습니다: " + item.platform());
            }
            PlatformAccount account = new PlatformAccount(member, platform, item.label());
            platformAccountRepository.persist(account);
            catalog.accounts().put(item.label(), account);
        });

        each(data.devices(), item -> {
            Device device = new Device(member, item.deviceType(), item.label(), item.memo());
            deviceRepository.persist(device);
            catalog.devices().put(item.label(), device);
        });

        each(data.emulators(), item -> {
            Emulator emulator = new Emulator(member, item.name(), item.memo());
            emulatorRepository.persist(emulator);
            catalog.emulators().put(item.name(), emulator);
        });

        // 입력방식도 기본 시드와 부딪힌다 (키보드 & 마우스 등) — 같은 규칙
        each(data.inputMethods(), name -> catalog.inputMethods().put(name,
                inputMethodRepository.findByMemberIdAndName(member.getId(), name)
                        .orElseGet(() -> {
                            InputMethod created = new InputMethod(member, name);
                            inputMethodRepository.persist(created);
                            return created;
                        })));

        each(data.subscriptions(), item -> {
            Subscription subscription = Subscription.of(member, new SubscriptionCommand(
                    item.serviceName(), item.startedOn(), item.endedOn(),
                    item.fee() == null ? null : item.fee().amount(),
                    item.fee() == null ? null : item.fee().currency(),
                    BillingCycle.valueOf(item.billingCycle())));
            subscriptionRepository.persist(subscription);
            catalog.subscriptions().put(item.serviceName(), subscription);
        });

        each(data.tags(), name -> {
            Tag tag = new Tag(member, name);
            tagRepository.persist(tag);
            catalog.tags().put(name, tag);
        });

        each(data.genres(), name -> {
            Genre genre = new Genre(member, name);
            genreRepository.persist(genre);
            catalog.genres().put(name, genre);
        });

        return catalog;
    }

    private void importProfile(Member member, MemberExport.Profile profile) {
        if (profile == null) {
            return;
        }
        // 이메일은 안 건드린다 — 로그인 아이디라 백업이 덮어쓸 값이 아니다
        member.updateProfile(profile.nickname(), profile.memo());
        member.changeBackgroundColors(
                profile.backgroundColors() == null ? null : String.join(",", profile.backgroundColors()));
    }

    /* ── 항목 ────────────────────────────────────────────── */

    private BacklogEntry importEntry(Member member, Game game,
                                     MemberExport.Entry item, Catalog catalog) {
        BacklogEntry entry = BacklogEntry.of(member, game);
        backlogEntryRepository.persist(entry);

        entry.updateOverrides(new OverrideCommand(
                item.nameOverride(), item.developerOverrides(), item.publisherOverrides(),
                item.releasedOnOverride(), money(item.listPriceOverride())));
        entry.updatePersonalRecord(item.rating(), item.playTimeHours(), item.memo());

        if (item.tag() != null) {
            entry.changeTag(required(catalog.tags(), item.tag(), "태그"));
        }

        each(item.genres(), name -> {
            BacklogEntryGenre link = new BacklogEntryGenre(entry, required(catalog.genres(), name, "장르"));
            genreLinkRepository.persist(link);
            entry.addGenreLink(link);
        });

        importPlaythroughs(entry, item, catalog);
        importAcquisitions(entry, item, catalog);

        if (item.cover() != null) {
            attachCover(entry, item.cover());
        }

        // 삭제 상태도 그대로 옮긴다 — 백업은 휴지통까지 재현해야 한다
        if (item.deletedAt() != null) {
            entry.softDelete(item.deletedAt());
        }
        return entry;
    }

    private void importPlaythroughs(BacklogEntry entry, MemberExport.Entry item, Catalog catalog) {
        each(item.playthroughs(), pt -> {
            Playthrough playthrough = Playthrough.of(entry, pt.sequenceNo(), new PlaythroughCommand(
                    pt.startedOn(), pt.finishedOn(), PlaythroughStatus.valueOf(pt.status()),
                    null, null, null, null, pt.label()));
            // 커맨드는 id를 받는데 여기엔 id가 없다 — 엔티티를 직접 물린다
            playthrough.assignReferences(
                    optional(catalog.devices(), pt.device()),
                    optional(catalog.accounts(), pt.platformAccount()),
                    optional(catalog.emulators(), pt.emulator()),
                    optional(catalog.inputMethods(), pt.inputMethod()));
            playthroughRepository.persist(playthrough);
            entry.addPlaythrough(playthrough);
        });
    }

    private void importAcquisitions(BacklogEntry entry, MemberExport.Entry item, Catalog catalog) {
        each(item.acquisitions(), ac -> {
            Acquisition acquisition = Acquisition.of(entry, new AcquisitionCommand(
                    AcquisitionMethod.valueOf(ac.method()), null, null, null,
                    ac.price() == null ? null : ac.price().amount(),
                    ac.price() == null ? null : ac.price().currency(),
                    ac.acquiredOn(), ac.label()));
            acquisition.assignReferences(
                    optional(catalog.platforms(), ac.platform()),
                    optional(catalog.accounts(), ac.platformAccount()));
            if (ac.subscription() != null) {
                acquisition.assignSubscription(
                        required(catalog.subscriptions(), ac.subscription(), "구독"));
            }
            acquisitionRepository.persist(acquisition);
            entry.addAcquisition(acquisition);
        });
    }

    /* ── 잡동사니 ────────────────────────────────────────── */

    private static <T> void each(List<T> items, java.util.function.Consumer<T> action) {
        if (items == null) {
            return;
        }
        items.forEach(action);
    }

    /** 없으면 조용히 null — 회차의 기기처럼 원래 비어 있을 수 있는 참조 */
    private static <T> T optional(Map<String, T> byName, String name) {
        return name == null ? null : byName.get(name);
    }

    /** 없으면 터진다 — 태그·장르·구독은 항목이 이름을 적어 놓았는데 사전에 없으면 백업이 깨진 것이다 */
    private static <T> T required(Map<String, T> byName, String name, String what) {
        T found = byName.get(name);
        if (found == null) {
            throw new InvalidInputException("%s가 백업의 사전에 없습니다: %s".formatted(what, name));
        }
        return found;
    }

    private static Money money(MemberExport.Money money) {
        return money == null ? null : new Money(money.amount(), money.currency());
    }

    /**
     * 커버 붙이기.
     *
     * ⚠️ **LOCAL 커버는 실물이 있을 때만 붙인다.** 이 JSON은 다른 기계로 건너갈 수 있는데
     * 로컬 파일은 따라오지 않는다(데이터 루트 폴더에 있다). 그대로 붙이면 화면마다
     * **깨진 이미지**가 뜨고, 사용자는 커버를 지울 수도 다시 올릴 수도 없는 상태가 된다.
     * 없으면 조용히 건너뛰고 마스터 커버로 폴백시키는 편이 낫다
     */
    private void attachCover(BacklogEntry entry, MemberExport.Cover cover) {
        // location은 6단계에 생겼다. 그 전에 뽑은 파일에는 없어서 EXTERNAL로 읽는다
        CoverLocation location = (cover.location() == null)
                ? CoverLocation.EXTERNAL : CoverLocation.valueOf(cover.location());

        if (location == CoverLocation.LOCAL
                && !localFileStore.exists(mediaPaths.covers(), cover.storageKey())) {
            log.info("로컬 커버 실물이 없어 건너뛴다. entry={} file={}",
                    entry.getDisplayName(), cover.storageKey());
            return;
        }

        coverImageRepository.persist(CoverImage.of(entry, cover.storageKey(),
                cover.contentType(), cover.sizeBytes(), location));
    }

}
