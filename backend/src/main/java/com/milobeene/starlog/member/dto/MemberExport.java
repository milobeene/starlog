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
 * - **커버 실물** — `storageKey`와 `location`만 담는다. 바이트는 스토리지나 로컬 폴더에 있다.
 *   ⚠️ **다른 기계로 옮기면 LOCAL 커버는 따라오지 않는다** — 그 파일은 데이터 루트의
 *   `covers/` 폴더에 있다. 가져오기가 파일을 못 찾으면 커버 없이 넣고 마스터 커버로 폴백한다.
 *   architecture §6이 말한 대로 **온전한 단위는 이 JSON이 아니라 데이터 루트 폴더**다
 * - **id** — 새 DB에서 어차피 새로 발급된다. 참조는 이름·순번으로 잇는다
 *
 * ## 참조를 잇는 방식
 * 선택지(플랫폼·기기 등)는 **이름으로** 잇는다. id는 DB마다 다르기 때문이다.
 * 그래서 이름이 유니크해야 하는데, 실제로 회원 안에서 유니크 제약이 걸려 있다.
 *
 * ⚠️ **계정만 예외다** — 유니크가 `(회원, 소속, 라벨)`이라 라벨은 소속마다 겹칠 수 있다.
 * 그래서 계정을 가리킬 때는 라벨 옆에 소속 이름을 함께 적는다 (형식 2, v1.1.3).
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

    /** 2 — 회차·취득이 계정을 `라벨 + 소속`으로 가리킨다 (v1.1.3) */
    public static final int FORMAT_VERSION = 2;

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
            Integer timeToBeatSamples,
            /**
             * 스크린샷 폴더 이름 (v1.0 7단계).
             *
             * ⚠️ **없으면 옮긴 뒤 스크린샷 연결이 끊긴다.** 파일은 `media/<slug>/`에 있는데
             * 새 DB의 게임은 폴더 이름을 모르는 채로 시작해서, 첫 저장 때 새 폴더를 만든다.
             * 이름이 같으면 우연히 같은 slug가 나오지만 **번호가 붙은 폴더는 영영 못 찾는다**
             */
            String mediaFolder
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
    /** location은 v1.0 6단계에 생겼다. 옛 파일에는 없어서 null이면 EXTERNAL로 읽는다 */
    public record Cover(String storageKey, String contentType, long sizeBytes, String location) {}

    /**
     * ⚠️ **`platformAccount`(라벨)만으로는 계정을 못 집는다** (형식 2).
     *
     * 계정의 유니크는 `(회원, 소속, 라벨)`이라 **같은 라벨이 소속마다 하나씩 있을 수 있다** —
     * `Beene(Steam)`과 `Beene(Nintendo)`처럼. 라벨만 적으면 되읽을 때 둘이 한 칸으로
     * 뭉개져 **엉뚱한 소속의 계정이 붙는다.** 그래서 소속 이름을 함께 적는다.
     *
     * 옛 파일(형식 1)에는 이 값이 없어 null로 들어온다 — 그때는 라벨로만 찾는다
     */
    public record Playthrough(int sequenceNo, LocalDate startedOn, LocalDate finishedOn,
                              String status, String label,
                              String device, String platformAccount,
                              String platformAccountPlatform,
                              String emulator, String inputMethod) {}

    /** `platform`은 **취득 자체의** 플랫폼이고, `platformAccountPlatform`은 **계정의** 소속이다 */
    public record Acquisition(String method, String platform, String platformAccount,
                              String platformAccountPlatform,
                              String subscription, Money price, LocalDate acquiredOn,
                              String label) {}
}
