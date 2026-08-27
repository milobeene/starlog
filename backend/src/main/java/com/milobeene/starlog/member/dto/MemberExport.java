package com.milobeene.starlog.member.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 회원 데이터 한 벌 — 내보내기·가져오기 공용 (v1.0 작업순서 0번).
 *
 * **왜 있는가** — 지금 실데이터가 Neon에만 있다. 사본이 하나도 없는 상태로
 * 스키마를 계속 만지는 건 위험하고, v1.0에서 데스크탑으로 옮길 때도 이사 수단이 필요하다.
 * 백업이자 이사 수단이자 앞으로도 계속 쓸 안전망이다.
 *
 * ## 담기지 않는 것
 * - **자격증명** — 비밀번호 해시·구글 sub. 이 파일은 동기화 폴더에 놓일 물건이라
 *   해시가 실려 다니면 안 된다. 가져오면 계정 자체는 새로 만들어진 것을 쓴다
 * - **파생 상태** — `status`·`displayName`·`lastPlayedOn`·`lastPlaythrough`·`releasedOnResolved`.
 *   원본에서 계산되는 값이라 담으면 두 개의 진실이 생긴다. 가져온 뒤 다시 계산한다
 * - **커버 실물** — `storageKey`만 담는다. 바이트는 R2에 있다.
 *   ⚠️ **R2까지 버리면 이 키는 무용지물이 된다.** 그때는 이미지 내보내기가 따로 필요하다
 * - **id** — 새 DB에서 어차피 새로 발급된다. 참조는 이름·순번으로 잇는다
 *
 * ## 참조를 잇는 방식
 * 선택지(플랫폼·기기 등)는 **이름으로** 잇는다. id는 DB마다 다르기 때문이다.
 * 그래서 이름이 유니크해야 하는데, 실제로 회원 안에서 유니크 제약이 걸려 있다.
 * 게임은 **`externalId`(IGDB) 또는 이름**으로 잇는다.
 */
public record MemberExport(
        /** 포맷 버전. 나중에 모양이 바뀌면 이걸 보고 갈라야 한다 */
        int formatVersion,
        LocalDateTime exportedAt,
        Profile profile,
        Catalog catalog,
        /** 항목이 참조하는 마스터 게임. 없으면 새 DB에서 항목이 게임을 못 찾는다 */
        List<Game> games,
        List<Entry> entries
) {

    public static final int FORMAT_VERSION = 1;

    /** 자격증명 없음 — 클래스 주석 참고 */
    public record Profile(String email, String nickname, String memo,
                          List<String> backgroundColors) {}

    /** 선택지 다섯 종 + 구독. **계정이 플랫폼을 참조하므로 플랫폼이 먼저다** */
    public record Catalog(
            List<String> platforms,
            List<Account> accounts,
            List<Device> devices,
            List<NamedMemo> emulators,
            List<String> inputMethods,
            List<Subscription> subscriptions,
            List<String> tags,
            List<String> genres
    ) {}

    /** 플랫폼은 이름으로 가리킨다 */
    public record Account(String label, String platform) {}

    public record Device(String deviceType, String label, String memo) {}

    public record NamedMemo(String name, String memo) {}

    public record Subscription(String serviceName, LocalDate startedOn, LocalDate endedOn,
                               Money fee, String billingCycle) {}

    public record Money(BigDecimal amount, String currency) {}

    public record Game(
            String externalId,      // IGDB id. 수동 등록이면 null
            String source,          // IGDB / MANUAL
            String name,
            List<String> developers,
            List<String> publishers,
            List<String> masterGenres,
            LocalDate releasedOn,
            Money listPrice,
            String coverImageId,
            String bannerImageId,
            String summary,
            String storyline,
            BigDecimal igdbRating,
            Integer igdbRatingCount,
            List<String> releasePlatforms,
            Integer mainStoryHours,
            Integer mainExtraHours,
            Integer completionistHours,
            Integer timeToBeatSamples
    ) {}

    /**
     * 항목 하나. `gameKey`가 위 `games`의 한 줄을 가리킨다
     * (`externalId`가 있으면 그것, 없으면 `name`).
     */
    public record Entry(
            String gameKey,
            LocalDateTime createdAt,
            /** null이 아니면 삭제된 항목이다. 삭제 상태도 그대로 옮긴다 */
            LocalDateTime deletedAt,
            String nameOverride,
            List<String> developerOverrides,
            List<String> publisherOverrides,
            LocalDate releasedOnOverride,
            Money listPriceOverride,
            BigDecimal rating,
            BigDecimal playTimeHours,
            String memo,
            String tag,
            List<String> genres,
            Cover cover,
            List<Playthrough> playthroughs,
            List<Acquisition> acquisitions
    ) {}

    /** 실물은 R2에 남는다 — 클래스 주석의 경고 참고 */
    public record Cover(String storageKey, String contentType, long sizeBytes) {}

    public record Playthrough(int sequenceNo, LocalDate startedOn, LocalDate finishedOn,
                              String status, String label,
                              String device, String platformAccount,
                              String emulator, String inputMethod) {}

    public record Acquisition(String method, String platform, String platformAccount,
                              String subscription, Money price, LocalDate acquiredOn,
                              String label) {}
}
