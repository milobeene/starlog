# 게임 백로그 — 엔티티 설계서 v0.4

| 항목 | 내용 |
|---|---|
| 문서 버전 | v0.4 |
| 최종 수정 | 2026-08-21 |
| 상태 | **Phase 2 (H-6까지) 완료** — 웹 계층 구현 및 테스트 138개 통과 |
| 기준 명세 | 게임백로그 기능명세서 v1.5 |
| 검증 환경 | Spring Boot 4.1.0 / Hibernate 7.4.1 / H2 2.4.240 |

> v0.1은 코드 이전의 초안, v0.2는 코드화 + DDL 검증 결과, v0.3은 서비스 계층 구현 결과였다.
> v0.4는 **웹 계층(Phase 2)을 붙이면서 드러난 것**을 반영한다.
> 스키마 확정은 여전히 Phase 9(Flyway 전환) 시점이다.

---

## 0-0. v0.3 → v0.4 변경 요약 (Phase 2)

| # | 변경 | 사유 |
|---|---|---|
| 1 | `BacklogEntry.releasedOnResolved` **비정규화 추가** + 인덱스 `(member_id, released_on_resolved)` | 출시일 정렬(FR-QRY-04)의 대상이 오버라이드와 마스터로 흩어져 있어 `COALESCE` 조인이 되고 인덱스를 못 탔다. `displayName`과 같은 패턴 — 갱신 경로는 `refreshReleasedOn()` 하나 |
| 2 | `default_batch_fetch_size: 100` | 목록 조회가 3항목에 8방(장르 6방)이었다. 4방으로 떨어졌고 **항목 수가 늘어도 안 늘어난다** |

> **Phase 4 주의**: IGDB 재동기화로 `Game.releasedOn`이 바뀌면 오버라이드 없는 항목의
> `releasedOnResolved`를 다시 계산해야 한다. `displayName` 전파(A-7)와 똑같은 벌크 UPDATE가 필요하다.

---

## 0. v0.2 → v0.3 변경 요약

| # | 변경 | 사유 |
|---|---|---|
| 1 | `BacklogEntry.lastPlaythrough` **비정규화 추가** | 목록 카드가 마지막 회차의 번호·기간·기기를 표시한다. 컬렉션은 fetch join 시 페이징이 깨지므로 `~ToOne` 참조로 우회 (§7.2) |
| 2 | 역방향 컬렉션 2개 추가 — `acquisitions`, `genreLinks` | 상태 파생이 취득을 봐야 하고, 장르 폴백 계산이 엔티티 안에서 일어나야 한다. **태그는 추가하지 않았다** — 폴백도 파생도 없어 리포지토리로 충분 |
| 3 | `Playthrough` 상태↔종료일 **불변식 3줄** (BR-PT-06) | 실데이터에 "닫힌 기간 + `PAUSED`"가 있었다. 열린 기간으로 대체하면 `lastPlayedOn`이 틀어져 기본 정렬이 깨진다 |
| 4 | 리포지토리를 **Spring Data JPA + 커스텀 `BaseRepository`**로 | `SimpleJpaRepository.save()`가 준영속 엔티티에 `merge()`를 돌린다. 인터페이스에서 빼면 컴파일 단계에서 막힌다 |
| 5 | `Money` 생성자에 **검증 추가** | 음수·비 ISO 4217 통화가 그대로 저장되고 있었다. `java.util.Currency`로 판정 |
| 6 | 유니크 제약 **이름 명시** 5개 | `unique = true`는 이름이 자동 생성된다. Phase 9 Flyway 전환 대비 (OI-16 일부 해소) |
| 7 | `Game.masterGenres`를 `updateMasterInfo`에 포함 | 장르 폴백 테스트와 Phase 4 외부 DB 동기화에 필요 |
| 8 | Command record 4종 신설 | 인자가 5~8개인 메서드에서 같은 타입이 나란히 붙어 순서를 바꿔도 컴파일이 통과했다 |
| 9 | 예외 계층 신설 — `RevivableException` | 되살리기 확인이 필요한 상태를 타입으로 표현. Phase 2에서 핸들러 하나로 잡는다 |
| 10 | 태그/장르 자동 소멸을 **조회 필터**로 | COUNT → DELETE에 경쟁 상태가 있었다. 조회에서 거르면 경쟁 대상 자체가 없다 |

---

## 0-1. v0.1 → v0.2 변경 요약 (이력)

| # | 변경 | 사유 |
|---|---|---|
| 1 | `Platform` / `Device`가 `BaseEntity`를 상속 | v0.1 코드화 시 누락. FR-SYS-01 위반이었음 |
| 2 | 오버라이드 개발사·퍼블리셔를 `String` → **`@ElementCollection`** | Obsidian 원본 `developer`가 **배열**이다. 단일 문자열이면 임포트 시 데이터 유실 |
| 3 | `memo` / `payload`를 `@Lob` → **`@Column(columnDefinition = "TEXT")`** | PostgreSQL에서 `@Lob` + `String`은 `oid`로 매핑되어 조회가 어긋난다 |
| 4 | `@AttributeOverride`에 `precision`/`scale`/`length` **재명시** | 오버라이드는 병합이 아니라 **교체**. `Money`의 설정이 사라졌었다 |
| 5 | 전 enum에 **`@JdbcTypeCode(SqlTypes.VARCHAR)`** | Hibernate 6.2+ 기본이 DB 네이티브 `enum` 타입이라 이식성이 깨진다 |
| 6 | `Member.deletedAt`, `AuthToken.expiresAt`에 인덱스 | 배치가 이 컬럼으로 스캔한다 |
| 7 | `Subscription.fee`에 컬럼명 오버라이드 | 없으면 컬럼명이 그냥 `amount`/`currency`가 되어 의미가 안 드러난다 |
| 8 | `BacklogEntry`의 역방향 컬렉션을 `playthroughs`만 남김 | 나머지는 실제로 필요해지는 Phase 1에 추가한다 |

---

## 1. 미결 해소 현황

| ID | 결정 | 상태 |
|---|---|---|
| OI-05 | Platform / Device 초기 목록 | **해소 (v0.3)** — `DataInitializer` 시드. Steam/Nintendo/Epic Games, 기기 6종, 에뮬 4종 |
| OI-06 | 구독 서비스명 → **문자열** (`Subscription.serviceName`) | 해소 |
| OI-10 | 실데이터의 회차 규칙 위반 여부 | **해소 (v0.3)** — BR-PT-03이 아니라 상태↔종료일 짝이 문제였다. BR-PT-06 신설 |
| OI-13 | 태그/장르 소멸 → **연결 해제 즉시** | 해소. 단 **구현 방식이 v0.3에서 바뀜** — 아래 |
| OI-15 | `columnDefinition = "TEXT"`의 PostgreSQL 동작 확인 | Phase 9 |
| OI-16 | 자동 생성된 제약 이름 정리 | **부분 해소 (v0.3)** — 유니크 5개 명시. FK 이름과 `CoverImage`는 Phase 9 |

> **OI-13 구현 개정 (v0.3)**: COUNT → 0이면 DELETE 방식을 폐기했다. 읽고-쓰기 사이에 경쟁 상태가 있어 두 요청이 동시에 마지막 연결을 떼면 둘 다 지우려 든다.
> **사전 행을 지우지 않고 조회에서 연결 1건 이상인 것만 반환한다.** 지연이 0이라 "즉시 사라진다"는 요구는 그대로 만족하고, 뗐던 태그를 다시 붙이면 원래 행을 재사용한다.
> `orphanRemoval` / `CascadeType.REMOVE`가 불가능한 이유는 v0.2와 같다 — `Tag`를 여러 `BacklogEntry`가 공유하므로 부모가 하나로 특정되지 않는다.

> **OI-16 부분 해소 (v0.3)**: `Platform.name`·`Device.name`·`Member.email`·`Member.googleSubject`·`AuthToken.tokenHash`에 이름을 붙였다.
> `CoverImage`는 **불가능**했다 — `@OneToOne`이 하이버네이트 스스로 컬럼 unique를 만들어서, `@Table`로 같은 컬럼에 이름을 주면 중복 판정되어 무시된다. DDL로 확인했다.

---

## 2. 패키지 구조

**패키지 바이 피처(package-by-feature).** 강의(활용 1편)의 `domain/`·`repository/` 평면 구조와 다르다.

```
com.milobeene.starlog
├─ GamebacklogApplication
├─ common/
│  ├─ entity/      BaseEntity, Money
│  ├─ config/      JpaConfig, DataInitializer
│  ├─ repository/  BaseRepository, BaseRepositoryImpl      (v0.3)
│  ├─ exception/   RevivableException                      (v0.3)
│  └─ util/        TextValues                              (v0.3)
├─ member/
│  ├─ domain/      Member, MemberRole
│  ├─ repository/  MemberRepository
│  └─ service/     MemberService
├─ game/
│  ├─ domain/      Game, GameSource
│  ├─ repository/  GameRepository
│  └─ service/     GameService
├─ backlog/
│  ├─ domain/      BacklogEntry, Playthrough, Acquisition, CoverImage,
│  │               BacklogEntryTag, BacklogEntryGenre, EntitySnapshot,
│  │               BacklogStatus, PlaythroughStatus, InputMethod,
│  │               AcquisitionMethod, SnapshotTarget,
│  │               OverrideCommand, PlaythroughCommand, AcquisitionCommand
│  ├─ repository/  BacklogEntryRepository, PlaythroughRepository,
│  │               AcquisitionRepository, BacklogEntryTagRepository,
│  │               BacklogEntryGenreRepository
│  ├─ service/     BacklogService, PlaythroughService, AcquisitionService,
│  │               BacklogEntryFinder
│  └─ exception/   RevivableEntryException
├─ tag/            Tag, Genre / TagRepository, GenreRepository / TagService, GenreService
├─ platform/       Platform, Device, PlatformAccount, MemberDevice, Emulator
│                  / 리포지토리 4 / PlatformAccountService, MemberDeviceService
│                  / RevivableAccountException
├─ subscription/   Subscription, BillingCycle, SubscriptionCommand
│                  / SubscriptionRepository / SubscriptionService
├─ auth/domain/    AuthToken, TokenPurpose
└─ admin/domain/   AuditLog
```

> **`BacklogEntryFinder`** — 소유권·생존 확인을 백로그 자식 서비스 넷(회차·취득·태그·장르)이 공유한다. 서비스끼리 주입하면 순환이 생기므로 작은 협력자로 뽑았다. 처음엔 package-private이었으나 `tag.service`에서도 쓰게 되면서 공개했다.

**배치 기준**: "이것만 따로 고칠 일이 있는가." 없으면 부모 피처에 흡수한다.

- `Playthrough` / `Acquisition` / `CoverImage` → `BacklogEntry` 없이 존재할 수 없으므로 `backlog/`
- `MemberDevice` → `Member`를 참조하지만 관심사는 "기기 보유". `PlatformAccount`와 대칭이므로 `platform/`
- enum은 쓰이는 피처 안에 둔다. 여러 피처가 공유하게 되면 그때 `common/`으로 올린다

**대가**: `backlog/`가 `game`, `member`, `tag`, `platform`, `subscription`을 모두 참조한다. `BacklogEntry`가 이 도메인의 허브라는 사실이 구조로 드러나는 것이므로 정상이다.

---

## 3. 코딩 규약 (Phase 0에서 확립)

| 규칙 | 이유 |
|---|---|
| `@Getter` 붙임 | 읽기는 어차피 필요하고 객체를 망가뜨리지 않는다 |
| **`@Setter` 금지** | 트랜잭션 안의 세터 호출은 `save()` 없이 UPDATE를 유발한다. 변경 경로 추적이 불가능해진다 |
| **`@Data` 금지** | `@Setter` + `@EqualsAndHashCode`가 딸려온다. 후자는 지연 로딩 프록시를 건드려 예상 못 한 쿼리를 낸다 |
| `@ToString`은 `exclude` 필수 | 연관 필드가 포함되면 무한 순환 |
| `protected 기본생성자`를 **직접 작성** | JPA가 리플렉션으로 객체를 만들 때 필요. 롬복(`@NoArgsConstructor`)으로도 되지만 학습 단계에선 명시적으로 둔다 |
| 정적 팩토리 메서드로 생성 | 생성 경로가 여럿일 때(폼 가입 vs 구글 가입) 이름으로 의도를 표현할 수 있다 |
| 모든 `~ToOne`에 `fetch = LAZY` **명시** | 기본값이 EAGER다. NFR-P2 |
| 모든 enum에 `@Enumerated(STRING)` + `@JdbcTypeCode(VARCHAR)` | ORDINAL은 값 순서가 바뀌면 기존 데이터의 의미가 밀린다 |
| 컬렉션 필드는 선언과 동시에 초기화 | `= new ArrayList<>()`. null 상태를 Hibernate가 싫어한다 |
| 문자열 `length`를 의도적으로 지정 | 안 정하면 255가 된다. 그건 "255가 맞다"가 아니라 "정하지 않았다"는 뜻 |

---

## 4. 공통

### `common/config/JpaConfig`

```java
@Configuration
@EnableJpaAuditing
public class JpaConfig {}
```

- 애플리케이션 클래스가 아니라 **별도 설정 클래스**로 둔다. 테스트에서 이 설정만 빼거나 갈아끼울 수 있다
- **없으면 예외가 아니라 조용히 `createdAt`이 null**로 들어간다

### `common/entity/BaseEntity` (`@MappedSuperclass`)

```java
@Getter
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class BaseEntity {

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}
```

- 전 엔티티가 상속 (FR-SYS-01) — **21개 테이블 전부에 `created_at`/`updated_at` 생성 확인**
- `@MappedSuperclass`는 테이블을 만들지 않는다. 자식 테이블에 컬럼을 복사할 뿐
- `updatable = false`로 생성 시각이 UPDATE 문에서 아예 빠진다
- 감사 애노테이션은 `org.springframework.data.annotation.*` (jakarta 아님)

### `common/entity/Money` (`@Embeddable`)

```java
@Getter
@Embeddable
public class Money {

    @Column(precision = 19, scale = 2)
    private BigDecimal amount;

    @Column(length = 3)
    private String currency;   // ISO 4217

    protected Money() {}

    public Money(BigDecimal amount, String currency) {
        this.amount = amount;
        this.currency = currency;
    }
}
```

- `double` 금지 — 부동소수점 오차로 정렬·비교가 어긋난다
- **불변이어야 한다.** 값 타입은 식별자가 없어 JPA가 "다른 객체"로 구분해주지 못하므로, 세터가 있으면 공유 참조로 남의 금액까지 바뀐다. 변경은 새 `Money`로 교체

#### ⚠️ `@AttributeOverride`는 병합이 아니라 교체다

한 엔티티에서 `Money`를 쓸 때 컬럼명을 바꾸면 `Money`의 `@Column`이 **통째로 대체**된다. `precision`/`length`를 다시 적지 않으면 기본값(`38,2` / `255`)이 된다.

```java
// 오버라이드가 있으면 precision·length를 반드시 재명시
@Embedded
@AttributeOverrides({
    @AttributeOverride(name = "amount",
        column = @Column(name = "fee_amount", precision = 19, scale = 2)),
    @AttributeOverride(name = "currency",
        column = @Column(name = "fee_currency", length = 3))
})
private Money fee;
```

**오버라이드가 없으면** `Money`의 설정이 그대로 산다 — 대신 컬럼명이 `amount`/`currency`가 되어 의미가 안 드러나므로, 결국 전부 명시하는 편이 낫다.

---

## 5. 엔티티 목록 (18개 → 테이블 21개)

> 테이블이 21개인 이유: `@ElementCollection` 5개(`game_developer`, `game_publisher`, `game_master_genre`, `backlog_developer_override`, `backlog_publisher_override`)가 별도 테이블로 생성되고, `BaseEntity`·`Money`는 테이블을 만들지 않기 때문.

### 5.1 독립 마스터

#### `Member` (`member/domain`)

| 필드 | 타입 | 제약 |
|---|---|---|
| `id` | Long | PK, IDENTITY |
| `email` | String | not null, unique, len 320 |
| `password` | String | nullable, len 100 — 소셜 전용 계정 대비 |
| `nickname` | String | not null, len 30 |
| `role` | MemberRole | not null |
| `emailVerified` | boolean | not null |
| `googleSubject` | String | nullable, unique, len 100 — 구글 `sub` (이메일 아님) |
| `deletedAt` | LocalDateTime | nullable |

- 인덱스: `idx_member_deleted_at (deleted_at)` — 유예 만료 배치가 이 컬럼으로 스캔
- 생성: `Member.signUpWithEmail(...)` 정적 팩토리. 구글 경로는 Phase 3에서 추가
- 삭제: 소프트 → 유예 만료 시 배치 물리 삭제

#### `Game` (`game/domain`)

| 필드 | 타입 | 제약 |
|---|---|---|
| `id` | Long | PK |
| `name` | String | **not null**, len 300 ⚠️1 |
| `developers` / `publishers` / `masterGenres` | List\<String\> | `@ElementCollection` ⚠️2 |
| `releasedOn` | LocalDate | nullable |
| `listPrice` | Money | nullable, `@AttributeOverride` |
| `source` | GameSource | not null |
| `externalId` | String | nullable, len 50 — IGDB 게임 ID |
| `coverImageId` | String | nullable, len 50 — IGDB `cover.image_id` (세로 박스아트) |
| `bannerImageId` | String | nullable, len 50 — IGDB `artworks[].image_id` (가로 키아트) |
| `summary` | String | nullable, **LONGTEXT** — About. 영문 원문. 실측 최대 3,254자 |
| `storyline` | String | nullable, **LONGTEXT** — 실측 최대 **20,764자**. `varchar(2000)`이면 터진다 |
| `igdbRating` | BigDecimal | nullable, precision 5 scale 2 — 유저 평점 0~100 |
| `igdbRatingCount` | Integer | nullable — 표본 수 |
| `releasePlatforms` | List\<String\> | `@ElementCollection` — 하드웨어 기종 ⚠️`Platform`과 다름 |
| `mainStoryHours` | Integer | nullable — `hastily` |
| `mainExtraHours` | Integer | nullable — `normally` (v1.6 `timeToBeatHours`가 여기로) |
| `completionistHours` | Integer | nullable — `completely` |
| `timeToBeatSamples` | Integer | nullable — `count` |
| `lastSyncedAt` | LocalDateTime | nullable |

- unique `(source, external_id)`
- 삭제 없음 (정리는 관리자 병합 FR-ADM-02)

> **v0.6에서 Game이 9필드 → 20필드가 됐다.** 상세 화면이 IGDB를 거의 그대로 보여주기로 하면서
> 마스터의 성격이 "식별 최소"에서 "IGDB 미러"로 바뀌었다 (스펙 §6.2).
> **늘어난 필드는 전부 표시값 규칙(§7.1) 밖이다** — 덮을 수단도, 이유도 없다.
>
> `summary`·`storyline`이 TEXT급이라 목록 조회(`join fetch b.game`)에 딸려온다.
> 개인 규모에서는 페이지당 20KB 수준이라 감수하고 한 테이블로 둔다.
> 무거워지면 `GameDetail` 1:1 분리가 탈출구다 — 되돌리기 어려운 결정이 아니다.
>
> ⚠️ `releasePlatforms`(PS5·Switch)와 `Platform` 엔티티(Steam·PSN)는 **다른 개념이다.**
> `Device`(내 보유 기기)와도 겹쳐 보이지만 엮지 않는다.

> 클리어 소요 시간 3종은 남들의 평균이지 내 기록이 아니다. 오버라이드를 만들지 않는다.
> **v0.5에서 이름이 바뀌었다** — `averagePlaytimeHours`(RAWG `playtime`, Steam 평균 플레이 시간)에서
> `timeToBeatHours`(IGDB `normally`, 클리어 소요 시간)로. 지표의 의미 자체가 다르다.
> 전체 게임의 2.4%만 값을 갖지만, 실제로 담을 만한 게임(평점 20건 이상)은 전수 보유한다 (실측).

> `coverImageId`는 **URL이 아니라 id**다. 크기별 URL은 표시 시점에 조합한다 —
> `//images.igdb.com/igdb/image/upload/{size}/{image_id}.jpg`.
> URL을 통째로 저장하면 크기를 바꿀 때마다 전 행을 갱신해야 한다.
> 개인 업로드 커버(`CoverImage`, Phase 5)가 우선이고 이건 폴백이다 (§6.10).

> `MANUAL`은 `externalId`가 null이라 유니크 제약에 걸리지 않는다(null은 서로 다른 값). 수동 등록 중복은 관리자 병합의 몫.

#### `Platform` / `Device` (`platform/domain`)

`id`, `name`(not null, unique, len 50). 둘 다 `BaseEntity` 상속. 삭제 없음.

> enum이 아니라 엔티티인 이유: 항목 추가에 재배포가 필요 없다 (FR-ADM-04).

### 5.2 회원 소유

#### `PlatformAccount` (`platform/domain`)

`member`(주인), `platform`(주인), `accountLabel`(not null, len 50), `deletedAt`
- unique `(member_id, platform_id, account_label)` / 삭제: 소프트 + revive

#### `MemberDevice` (`platform/domain`)

`member`, `device` — 보유 기기. **입력 편의용이며 제약이 아니다** (BR-PT-05)
- unique `(member_id, device_id)` / 삭제: 물리

#### `Subscription` (`subscription/domain`)

`member`(주인), `serviceName`(문자열 — OI-06), `startedOn`(not null), `endedOn`(null=구독 중), `fee`(Money), `billingCycle`
- 삭제: 물리

#### `Tag` / `Genre` (`tag/domain`)

`member`(주인), `name`(not null, len 50)
- unique `(member_id, name)` — **각각 별도로**
- 삭제: 물리 (연결 0되면 즉시 — OI-13)

> ⚠️6 **상속으로 묶지 말 것.** 테이블이 합쳐지면 `(member, name)` 유니크가 태그·장르를 가로질러 걸려, "명작" 태그가 있으면 "명작" 장르를 만들 수 없다.

### 5.3 중심축 — `BacklogEntry` (`backlog/domain`)

| 구분 | 필드 |
|---|---|
| 연관 | `member`(주인), `game`(주인) |
| 오버라이드 | `nameOverride`, **`developerOverrides`(List)**, **`publisherOverrides`(List)**, `releasedOnOverride`, `listPriceOverride` |
| 개인 기록 | `rating`(`numeric(4,1)`), `playTimeHours`, `memo`(TEXT) |
| 비정규화 | `displayName`(not null), `status`(not null), `lastPlayedOn`, **`lastPlaythrough`**(v0.3), **`releasedOnResolved`**(v0.4) |
| 기타 | `deletedAt` |
| 역방향 | `playthroughs`, **`acquisitions`**, **`genreLinks`** (전부 `mappedBy = "backlogEntry"`) |

- unique `(member_id, game_id)` — FR-BL-02
- 인덱스 4개: `(member_id, status)` / `(member_id, last_played_on)` / `(member_id, display_name)` / `(member_id, released_on_resolved)`(v0.4)
- 삭제: 소프트 + revive

**오버라이드 값 표현**: 리스트는 "없음"이 `null`이 아니라 **빈 리스트**다. 표시값 계산은 `overrides.isEmpty() ? master : overrides`.

#### 표시값 계산 메서드 (§5.2 — 한 곳에만)

`resolvedDevelopers()` / `resolvedPublishers()` / `resolvedReleasedOn()` / `resolvedListPrice()` / `resolvedGenres()`

`displayName`만 컬럼으로 저장한다. 나머지는 계산한다. **기준은 "쿼리 대상인가"** — 검색·정렬·필터에 쓰이면 컬럼, 화면에 뿌리기만 하면 계산이다. `displayName`은 두 테이블(`name_override` + `game.name`)에 걸쳐 있어 조인 건너편에 인덱스를 걸 수 없으므로 컬럼이어야 한다.

#### `lastPlaythrough` (v0.3 신설)

`@ManyToOne(fetch = LAZY)` → `last_playthrough_id` (nullable)

- 목록 카드가 마지막 회차의 **번호·시작일·종료일·기기**를 표시한다. 매번 회차를 뒤지면 항목 수만큼 쿼리가 나가는데, 컬렉션 fetch join은 페이징을 깨므로 우회가 어렵다
- `~ToOne`이라 **join fetch가 가능하고 페이징도 살아남는다**
- 갱신 경로가 `syncDerivedState()` 하나뿐이라 유지 비용이 `lastPlayedOn`과 같다 (같은 자리에서 이미 최신 회차를 계산한다)
- `backlog_entry ↔ playthrough` **순환 FK**가 생긴다. nullable이라 Hibernate가 INSERT → UPDATE 순으로 처리하고, 삭제 시에도 UPDATE(참조 이동)가 DELETE보다 먼저 나간다. SQL 로그로 확인함

#### 역방향 컬렉션 3개 — 왜 이 셋만인가

| 컬렉션 | 이유 |
|---|---|
| `playthroughs` | 상태 파생(§7.6)이 순회한다 |
| `acquisitions` | 회차 0개일 때 상태를 취득이 정한다 |
| `genreLinks` | 마스터 폴백 계산이 엔티티 안에서 일어나야 한다 (§5.2) |

**태그는 넣지 않았다.** 폴백도 파생 상태도 없어서 리포지토리 조회로 충분하다. 대칭이 깨져 보이지만 의도된 것이다 — 매핑을 미리 만들면 안 쓰는 매핑만 늘고 컬렉션을 직접 조작할 여지가 생긴다.

> **구현 함정 (Phase 1에서 3번 반복됨)**: `mappedBy` 역방향은 읽기 전용이라 자식을 `persist`해도 **이미 로드된 부모의 컬렉션에 들어가지 않는다.** 바로 뒤에 파생 계산을 부르면 방금 넣은 자식을 못 본다. `addPlaythrough()` / `addAcquisition()` / `addGenreLink()` 편의 메서드로 양쪽을 같이 채운다.

### 5.4 항목 종속 (`backlog/domain`)

#### `Playthrough`

`backlogEntry`(주인), `sequenceNo`(not null), `startedOn`(not null), `finishedOn`(null=아직 안 닫힘), `status`, `label`, `device`(nullable ⚠️4), `platformAccount`(nullable), `emulator`(nullable), `inputMethod`(nullable)
- unique `(backlog_entry_id, sequence_no)` / 삭제: 물리

**`sequenceNo` 구멍 — 허용으로 확정 (v0.3)**

재부여하면 `(backlog_entry_id, sequence_no)` 유니크와 싸운다. 3→2로 내리는 순간 잠깐 2가 둘이 되어 UPDATE 순서를 정렬해야 한다. 무엇보다 **§7.6이 "최신 회차는 번호가 아니라 날짜 기준"**이라 번호는 표시용 라벨일 뿐 로직에 쓰이지 않는다.

**상태 ↔ 종료일 불변식 (BR-PT-06, v0.3 신설)**

```
PLAYING              종료일 없어야 함
PAUSED               종료일 있어도 없어도 됨   ← 여기만 자유
DROPPED | COMPLETED  종료일 있어야 함
```

BR-PT-03(동시 1개)과 BR-PT-02(겹침)의 판정 기준도 **상태가 아니라 종료일**이다. 종료일 없는 회차는 시작일부터 무한대까지 점유한다.

- 근거: 실데이터에 "6/3~6/11 하다 멈춤"(닫힌 기간 + `PAUSED`) 기록이 있었다. 열린 기간으로 대체하면 `lastPlayedOn`이 시작일이 되어 최근 플레이순 정렬이 틀어진다
- 검증 분담: **BR-PT-01·04·06은 엔티티**(자기 필드만 보면 됨), **BR-PT-02·03은 서비스**(형제 회차를 봐야 함)

**`inputMethod`는 단일 enum 유지 (v0.3 결정)**

실데이터는 리스트(`[keyboard & mouse, controller (XBox)]`)다. 한 회차에서 입력 방식을 여럿 쓴 기록은 **하나만 남는다.** 입력 방식이 통계 축도 필터 조건도 아니므로(FR-PT-05는 SHOULD) 조인 테이블을 하나 더 만들 값어치가 없다고 판단했다.

#### `Acquisition`

`backlogEntry`(주인), `method`, `platform`(nullable), `platformAccount`(nullable — 실물엔 없음), `subscription`(nullable — FR-ACQ-05), `price`(Money), `acquiredOn`, `label`
- 삭제: 물리. 1:N이므로 재구매·DLC를 복수 행으로 담는다

#### `CoverImage`

`backlogEntry`(**`@OneToOne` 주인**, `uk_cover_image_backlog_entry`), `storageKey`, `contentType`, `sizeBytes`
- 삭제: 물리 (스토리지 파일 포함)

> **v0.5에서 `url` 필드를 뺐다.** `publicBaseUrl + storageKey`로 조합 가능한데 저장해두면
> 도메인·CDN이 바뀔 때 전 행을 갱신해야 한다. `Game.coverImageId`와 같은 판단이다.

> **BacklogEntry에 역방향 필드를 두지 않는다.** `mappedBy` 쪽 `@OneToOne`은 지연 로딩이 안 되어
> 목록 조회마다 커버 SELECT가 항목 수만큼 나간다. 커버가 필요하면 리포지토리로 읽고,
> 목록은 `findByBacklogEntryIdIn`으로 페이지 단위 한 방에 가져온다.

> ⚠️5 **FK를 가진 쪽이 주인이어야 한다.** `mappedBy` 쪽 `@OneToOne`은 지연 로딩이 동작하지 않는다(값 유무를 알아야 프록시를 만들지 결정할 수 있는데, FK가 없는 쪽은 그걸 모른다).

### 5.5 조인 엔티티 (`@ManyToMany` 미사용)

`BacklogEntryTag` / `BacklogEntryGenre` — `backlogEntry` + `tag`/`genre`, unique 조합, 삭제 물리.

> `@ManyToMany`를 쓰지 않는 이유: 조인 테이블이 숨겨져 컬럼 추가("태그 붙인 날짜" 등)가 불가능하고 쿼리 제어가 어렵다.

### 5.6 부속

#### `EntitySnapshot` (`backlog/domain`)

`targetType`, `targetId`(⚠️7 **FK 아님**), `payload`(TEXT, JSON), `changedBy`
- 인덱스: `(target_type, target_id, created_at)` — "이 항목의 이력을 시간순으로"가 인덱스만으로 해결
- 삭제 없음

> 대상이 2종이라 DB FK를 걸 수 없다 → 참조 무결성이 보장되지 않는다 → 명세 §7.5의 **"복원은 실패할 수 있다"**와 직결된다. 셋은 같은 사실의 다른 표현이다.

#### `AuthToken` (`auth/domain`)

`member`, `purpose`(len 30), `tokenHash`(not null, unique — **원문 저장 금지**, NFR-S2), `expiresAt`(not null), `usedAt`(null=미사용)
- 인덱스: `idx_auth_token_expires_at` — 만료분 정리 배치용
- 삭제: 물리 (배치)

> ⚠️8 인증·재설정 토큰 통합. 명세가 "구조 동일"이라 명시. Phase 3에서 분리 가능.

#### `AuditLog` (`admin/domain`)

`actor`, `action`(not null), `targetType`, `targetId`, `requestIp`, `userAgent`
- 삭제 없음. **인덱스는 아직 없다** — 조회 패턴이 Phase 3에서 정해진다. 추측으로 붙이지 않는다

---

## 5-1. 데이터 접근 계층 (v0.3 신설)

Spring Data JPA를 쓰되 `JpaRepository`를 **직접 상속하지 않는다.**

```
common/repository/BaseRepository<T, ID>      findById · findAll · delete · persist
      └─ BaseRepositoryImpl                  SimpleJpaRepository 상속 + persist 구현
           MemberRepository / GameRepository / BacklogEntryRepository / ...  (총 11개)
```

**근거**: `SimpleJpaRepository.save()`는 내부가 `if (새 엔티티) persist else merge`다. 준영속 엔티티에 부르면 조용히 `merge()`가 돌아 설계 원칙(변경 감지 우선, `merge()` 금지)을 어긴다. **인터페이스에서 `save()`를 빼면 컴파일 단계에서 막힌다.** 실제로 `repo.save(detached)`가 `cannot find symbol`로 거부되는 것을 확인했다.

- 신규 저장은 `persist()`, 수정은 **변경 감지**, 벌크는 `@Modifying` + `@Query`
- `@EnableJpaRepositories(basePackages = "com.milobeene.starlog", repositoryBaseClass = BaseRepositoryImpl.class)` — 이 애노테이션을 직접 달면 부트 자동 설정이 꺼지므로 `basePackages`를 반드시 명시한다

> **시행착오**: 처음에 커스텀 조각(fragment) 방식(`EntityPersister` + `EntityPersisterImpl`)으로 시도했으나 스프링이 조각 구현을 못 찾아 `persist`를 **메서드 이름 쿼리**로 해석하려다 실패했다. 조각은 리포지토리마다 **다른** 기능을 붙일 때 쓰는 것이고, **모든 리포지토리가 공유하는** 기능은 `repositoryBaseClass`가 정석이다.

**벌크 연산 주의** — `BacklogEntryRepository.updateDisplayNameByGameId` (마스터 이름 전파, A-7)

```java
@Modifying(flushAutomatically = true, clearAutomatically = true)
@Query("update BacklogEntry b set b.displayName = :newName, b.updatedAt = :now ...")
```

- `updatedAt`을 SET 절에 **직접 써야 한다.** 벌크는 엔티티 생명주기 콜백을 안 거쳐 `@LastModifiedDate`가 돌지 않는다
- `flushAutomatically`가 없으면 같은 트랜잭션에서 바꾼 `Game.name`이 유실된다. 자동 flush는 쿼리가 건드리는 테이블과 겹치는 변경만 밀어내는데, `Game` 변경은 `backlog_entry`와 안 겹쳐서 안 밀린 채 `clear`에 날아갔다 (테스트로 재현함)

---

## 5-2. Command record (v0.3 신설)

서비스 입력을 묶은 도메인 record. **웹 DTO가 아니다** (그건 Phase 2 H-1에서 결정).

`OverrideCommand` · `PlaythroughCommand` · `AcquisitionCommand` · `SubscriptionCommand`

**근거**: 인자가 5~8개로 늘면서 같은 타입이 나란히 붙었다. `updateOverrides(memberId, entryId, name, devs, pubs, date, price)`는 `List<String>` 둘이 인접해 **순서를 바꿔 넣어도 컴파일이 통과한다.**

---

## 5-3. 예외 계층 (v0.3 신설)

```
common/exception/RevivableException          (추상, targetId 보유)
  ├─ backlog/exception/RevivableEntryException
  └─ platform/exception/RevivableAccountException
```

소프트 삭제 대상은 **재등록 시 3분기**가 필요하다 (§7.4).

```
재등록 요청
 ├─ 살아있는 행 존재  → IllegalStateException
 ├─ 삭제된 행 존재    → RevivableException  → 확인 후 revive()
 └─ 없음             → INSERT
```

공통 베이스만 `common/exception`에 두고 구체 예외는 각 피처 패키지에 둔다. Phase 2(H-5)에서 `@ExceptionHandler(RevivableException.class)` 하나로 되살리기 계열을 전부 409 + "복원할까요?"로 번역하면서도, 구체 타입으로 어느 도메인인지 구분한다.

**나머지 예외는 표준 타입을 쓴다** — `IllegalArgumentException`(못 찾음·입력 오류) / `IllegalStateException`(소유권·상태 충돌). H-5에서 상태코드로 번역한다.

---

## 6. enum (9개)

```
MemberRole         USER | ADMIN                                       member/
GameSource         IGDB | MANUAL                                      game/
BacklogStatus      WISHLIST|BACKLOG|PLAYING|PAUSED|DROPPED|COMPLETED  backlog/
PlaythroughStatus  PLAYING | PAUSED | DROPPED | COMPLETED             backlog/
InputMethod        XINPUT|NINTENDO|PLAYSTATION|KEYBOARD_MOUSE         backlog/
AcquisitionMethod  PURCHASED|SUBSCRIPTION|FREE|GIFT|BORROWED|DEMO|NOT_OWNED  backlog/
SnapshotTarget     BACKLOG_ENTRY | PLAYTHROUGH                        backlog/
BillingCycle       MONTHLY | YEARLY                                   subscription/
TokenPurpose       EMAIL_VERIFICATION | PASSWORD_RESET                auth/
```

**전부 아래 3종 세트를 붙인다.**

```java
@Enumerated(EnumType.STRING)
@JdbcTypeCode(SqlTypes.VARCHAR)
@Column(nullable = false, length = 20)
```

| 애노테이션 | 없으면 |
|---|---|
| `@Enumerated(STRING)` | ORDINAL(정수)이 되어 값을 중간에 끼워넣으면 기존 데이터의 의미가 통째로 밀린다 |
| `@JdbcTypeCode(VARCHAR)` | Hibernate 6.2+가 **DB 네이티브 `enum` 타입**을 생성한다. 값 추가 시 `ALTER TYPE`이 필요하고 DB마다 다르다 |

**전역 설정 `hibernate.type.preferred_enum_jdbc_type: VARCHAR`는 적용되지 않았다.** 애노테이션 방식으로 확정.

생성된 DDL은 `varchar(20) + check (status in (...))` 형태 — 이식성과 값 검증을 모두 얻은 셈이다. 단, enum 값 추가 시 check 제약 갱신이 필요하다(Flyway에서 명시적으로 관리).

---

## 7. Phase 0에서 검증된 판단

| # | 지점 | 판단 | 검증 결과 |
|---|---|---|---|
| 1 | `Game.name` | not null | 유지. null이면 `displayName` 계산이 깨진다 |
| 2 | 개발사·퍼블리셔·마스터장르 | `@ElementCollection` | 유지. 대가: 테이블 5개 증가, **PK가 없어 수정 시 전체 DELETE 후 재INSERT** |
| 3 | ~~오버라이드 개발사·퍼블리셔 단일 문자열~~ | **폐기** | Obsidian 원본이 배열. `@ElementCollection`으로 대칭 회복 |
| 4 | `Playthrough.device` | nullable | 유지. 임포트 전체 실패 방지. 앱 레벨 검증으로 보완 |
| 5 | `CoverImage`가 FK 소유 | 1:1 방향 | 유지. DDL에 `backlog_entry_id ... unique` 확인 |
| 6 | Tag / Genre 상속 안 함 | 유지 | `uk_tag_member_name`, `uk_genre_member_name` 별도 생성 확인 |
| 7 | `EntitySnapshot.targetId` FK 아님 | 유지 | DDL에 FK 없음 확인 |
| 8 | AuthToken 통합 | 유지 | Phase 3에서 재검토 |

### 코드 리뷰로는 잡히지 않고 DDL로만 드러난 것

1. `@AttributeOverride`의 속성 삼킴 → `numeric(38,2)`, `varchar(255)`
2. enum의 네이티브 타입 생성
3. 전역 프로퍼티 미적용

> **원칙: 엔티티를 만지면 DDL을 본다.** 매핑 애노테이션의 실제 효과는 코드만 봐서 알 수 없다.

---

## 8. Phase 1 결과와 Phase 2로 넘기는 것

### 8-1. Phase 1에서 구현 완료 ✅

| 위치 | 내용 |
|---|---|
| `BacklogEntry` | `syncDerivedState()` — 회차 있으면 최신 회차가, 없으면 취득이 `status`를 정한다. `lastPlayedOn`·`lastPlaythrough`도 여기서 |
| `BacklogEntry` | 표시값 계산 5종 — `오버라이드 ?? 마스터`를 한 곳에만 |
| `BacklogEntry` | `refreshDisplayName()` / `refreshReleasedOn()`(v0.4) — 비정규화 갱신 경로를 한 곳으로 |
| 서비스 계층 | BR-PT-02·03 (형제 회차를 봐야 하므로 엔티티가 아님) |
| 서비스 계층 | 태그/장르 자동 소멸 — **조회 필터 방식으로 변경** (OI-13 개정) |
| 서비스 계층 | `GameService.updateName` — 벌크 UPDATE로 전 회원 `displayName` 전파 |
| 시드 | `DataInitializer` — Platform 3 / Device 6 / Emulator 4 (OI-05 해소) |

> `syncFromPlaythroughs()`는 취득까지 보게 되면서 **`syncDerivedState()`로 개명**했다.

### 8-2. Phase 2로 넘기는 것

| 대상 | 내용 |
|---|---|
| DTO | 엔티티를 그대로 반환 중인 조회 메서드들을 DTO로 감싼다. **`open-in-view: false`라 컨트롤러에서 LAZY를 건드리면 터진다** |
| 조회 전용 서비스 | 화면 단위 조합 지점. 목록 카드가 5개 도메인을 걸친다 |
| N+1 | 목록 조회에 batch size 적용. `lastPlaythrough`는 join fetch |
| 예외 번역 | `@RestControllerAdvice` — 표준 예외 + `RevivableException` → 상태코드 |
| 태그 카운트 | 폴더 UI를 위한 태그별 항목 수 집계 쿼리 (신규) |

### 8-3. 미착수 — 슬라이스 G (변경 이력)

`EntitySnapshot` 엔티티는 있으나 **아무도 쓰지 않는다.** SHOULD 우선순위라 Phase 2 이후로 이월했다.

### 8-4. 이월된 결정 (Phase 1 리뷰에서 발견)

| 대상 | 내용 | 시점 |
|---|---|---|
| `AuditLog.actor` / `EntitySnapshot.changedBy` | `optional = false` FK인데 I-8이 회원을 **물리 삭제**한다. FK 위반으로 삭제가 실패한다. FK 대신 `actorId` + 이메일 스냅샷이 정석 | **I-8 전** |
| `Subscription` 물리 삭제 | 취득이 참조 중이면 커밋 시점 FK 예외. 앱에서 막지 않고 DB에 맡기기로 함 | H-5에서 409 번역 |
| `display_name` 정렬 | 한글 정렬 순서가 H2와 PostgreSQL에서 다를 수 있다 | Phase 9 |
| 모드 리스트 | 실데이터 본문에 회차별 모드 목록이 있으나 담을 필드가 없다 | Phase 7 |

### 동시성에 대한 인식

- `(member_id, game_id)`, `(backlog_entry_id, sequence_no)` 등은 **DB 유니크 제약이 진짜 방어선**이다. 애플리케이션 검증은 조회→판단→저장이 원자적이지 않아 동시 요청을 막지 못한다
- **BR-PT-03("진행 중 회차 1개")은 유니크 제약으로 표현할 수 없다.** 부분 유니크 인덱스(`WHERE finished_on IS NULL`)가 답이지만 H2가 지원하지 않아 Phase 9로 미뤄져 있다
- 실사용자 1명이라 실제로 터지지는 않는다. 다만 **"애플리케이션 검증은 최선 노력이고 진짜 보장은 DB만 한다"**는 구분은 유지한다

---

## 9. Phase 9(Flyway 전환) 체크리스트

- [ ] `columnDefinition = "TEXT"`가 PostgreSQL에서 의도대로 동작하는지 (OI-15)
- [ ] 자동 생성 FK 이름(`FK17cl9i46ao4knuyuofimh96gt` 등)을 명시적 이름으로 (OI-16)
- [ ] `CoverImage.backlogEntry`의 이름 없는 unique 제약에 이름 부여
- [ ] enum `check` 제약을 마이그레이션 스크립트로 명시 관리
- [ ] 부분 유니크 인덱스 재검토 — PostgreSQL은 지원한다 (BR-PT-03, 소프트 삭제 × 유니크)
- [ ] `ddl-auto`를 `validate`로 전환 (NFR-O2)
- [ ] `@ElementCollection` 테이블의 조회 성능 재확인 (PK 없음)

> **DDL은 초안이다.** 운영에서 `create`/`update` 금지.

# 임시 수정 사항
1. 문서의 "21개"는 틀렸다 — 실제 24개 (+EMULATOR)

세어보면 엔티티 19개 + @ElementCollection 5개 = 23개가 맞아. 설계서 §5의 "21개"는 오타야. 나중에 Flyway 스크립트 쓸 때 개수로 대조하면 헷갈리니까 문서 고쳐두자.

2. 의도대로 나온 것들 (검증 완료)
MEMBER — EMAIL unique, GOOGLE_SUBJECT unique, IDX_MEMBER_DELETED_AT ✓
BACKLOG_ENTRY — UK_BACKLOG_ENTRY_MEMBER_GAME + 인덱스 3개 전부 ✓
PLAYTHROUGH — UK_PLAYTHROUGH_SEQUENCE (BACKLOG_ENTRY_ID, SEQUENCE_NO) ✓
TAG / GENRE — UK_TAG_MEMBER_NAME, UK_GENRE_MEMBER_NAME 별도로 생성됨 ✓ (상속 안 한 판단이 여기서 확인됨)
COVER_IMAGE — BACKLOG_ENTRY_ID에 unique ✓ (이름 없는 CONSTRAINT_INDEX_C → Phase 9 항목에 이미 있음)
ENTITY_SNAPSHOT.TARGET_ID — FK 없음 ✓ / CHANGED_BY는 FK 있음 ✓
enum 전부 VARCHAR(20) + CHECK ✓
AUDIT_LOG 인덱스 없음 ✓ (의도대로)

PK 생성 방식도 확인됐어. BIGINT DEFAULT NEXT VALUE FOR "SYSTEM_SEQUENCE_..." NULL_TO_DEFAULT는 H2가 IDENTITY 컬럼을 내부적으로 표현하는 방식이야. 시퀀스 목록에 *_SEQ 같은 게 아니라 SYSTEM_SEQUENCE_*만 있는 게 그 증거. 만약 @GeneratedValue를 AUTO로 뒀다면 Hibernate 6+ 기본이 시퀀스 전략이라 game_seq 같은 이름이 떴을 거야. IDENTITY로 제대로 들어갔다.