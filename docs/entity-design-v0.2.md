# 게임 백로그 — 엔티티 설계서 v0.2

| 항목 | 내용 |
|---|---|
| 문서 버전 | v0.2 |
| 최종 수정 | 2026-08-18 |
| 상태 | **Phase 0 완료** — 코드화 및 DDL 검증 끝 |
| 기준 명세 | 게임백로그 기능명세서 v1.4 |
| 검증 환경 | Spring Boot 4.1.0 / Hibernate 7.4.1 / H2 2.4.240 |

> v0.1은 코드 이전의 초안이었다. v0.2는 **실제로 코드로 옮기고 `ddl-auto: create`로 DDL을 확인한 결과**를 반영한다.
> 스키마 확정은 여전히 Phase 9(Flyway 전환) 시점이다.

---

## 0. v0.1 → v0.2 변경 요약

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
| OI-05 | Platform / Device 초기 목록 | **Phase 1 시드 작성 시로 이관.** 엔티티 구조에 영향 없음 |
| OI-06 | 구독 서비스명 → **문자열** (`Subscription.serviceName`) | 해소 |
| OI-13 | 태그/장르 소멸 → **연결 해제 즉시.** 서비스 계층 COUNT 후 DELETE | 해소 |
| OI-15 | `columnDefinition = "TEXT"`의 PostgreSQL 동작 확인 | Phase 9 |
| OI-16 | 자동 생성된 FK 이름(`FK17cl9i...`) 정리 | Phase 9 |

> **OI-13 구현 주의**: `orphanRemoval` / `CascadeType.REMOVE`로는 불가능하다. `Tag`는 여러 `BacklogEntry`가 공유하므로 부모가 하나로 특정되지 않는다.

---

## 2. 패키지 구조

**패키지 바이 피처(package-by-feature).** 강의(활용 1편)의 `domain/`·`repository/` 평면 구조와 다르다.

```
com.milobeene.gamebacklog
├─ GamebacklogApplication
├─ common/
│  ├─ entity/     BaseEntity, Money
│  ├─ config/     JpaConfig
│  └─ exception/  (Phase 2)
├─ member/domain/        Member, MemberRole
├─ game/domain/          Game, GameSource
├─ backlog/domain/       BacklogEntry, Playthrough, Acquisition, CoverImage,
│                        BacklogEntryTag, BacklogEntryGenre, EntitySnapshot,
│                        BacklogStatus, PlaythroughStatus, InputMethod,
│                        AcquisitionMethod, SnapshotTarget
├─ tag/domain/           Tag, Genre
├─ platform/domain/      Platform, Device, PlatformAccount, MemberDevice
├─ subscription/domain/  Subscription, BillingCycle
├─ auth/domain/          AuthToken, TokenPurpose
└─ admin/domain/         AuditLog
```

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
| `externalId` | String | nullable, len 50 — RAWG 게임 ID |
| `lastSyncedAt` | LocalDateTime | nullable |

- unique `(source, external_id)`
- 삭제 없음 (정리는 관리자 병합 FR-ADM-02)

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
| 비정규화 | `displayName`(not null), `status`(not null), `lastPlayedOn` |
| 기타 | `deletedAt` |
| 역방향 | `playthroughs` (`mappedBy = "backlogEntry"`) |

- unique `(member_id, game_id)` — FR-BL-02
- 인덱스 3개: `(member_id, status)` / `(member_id, last_played_on)` / `(member_id, display_name)`
- 삭제: 소프트 + revive

**오버라이드 값 표현**: 리스트는 "없음"이 `null`이 아니라 **빈 리스트**다. 표시값 계산은 `overrides.isEmpty() ? master : overrides`.

**역방향 컬렉션을 최소로 둔 이유**: 매핑은 언제든 추가할 수 있지만, 미리 만들면 안 쓰는 매핑만 늘고 실수로 컬렉션을 직접 조작할 여지가 생긴다. `playthroughs`만 둔 것은 상태 동기화에 확실히 필요하기 때문.

### 5.4 항목 종속 (`backlog/domain`)

#### `Playthrough`

`backlogEntry`(주인), `sequenceNo`(not null), `startedOn`(not null), `finishedOn`(null=진행 중), `status`, `label`, `device`(nullable ⚠️4), `platformAccount`(nullable), `inputMethod`(nullable)
- unique `(backlog_entry_id, sequence_no)` / 삭제: 물리

> 회차를 물리 삭제하면 `sequenceNo`에 구멍이 생긴다(1·3만 남는 등). 당겨서 재부여할지는 Phase 1에서 결정. 지금은 구멍 허용.

#### `Acquisition`

`backlogEntry`(주인), `method`, `platform`(nullable), `platformAccount`(nullable — 실물엔 없음), `subscription`(nullable — FR-ACQ-05), `price`(Money), `acquiredOn`, `label`
- 삭제: 물리. 1:N이므로 재구매·DLC를 복수 행으로 담는다

#### `CoverImage`

`backlogEntry`(**`@OneToOne` 주인**, unique), `storageKey`, `url`, `contentType`, `sizeBytes`
- 삭제: 물리 (스토리지 파일 포함)

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

## 6. enum (9개)

```
MemberRole         USER | ADMIN                                       member/
GameSource         RAWG | MANUAL                                      game/
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

## 8. Phase 1로 넘기는 것

엔티티에 **필드만 있고 행위가 없는 상태**다. 아래는 Phase 1에서 구현한다.

| 위치 | 내용 |
|---|---|
| `BacklogEntry` (엔티티) | `syncFromPlaythroughs()` — 최신 회차(§7.6) 기준 `status`·`lastPlayedOn` 재계산. 회차 0개일 때의 분기 포함 |
| `BacklogEntry` (엔티티) | 표시값 계산 — `오버라이드 ?? 마스터`를 **한 곳에만** 둔다 |
| `BacklogEntry` (엔티티) | 비정규화 갱신 메서드 — `displayName` 변경 경로를 한 곳으로 모은다 |
| 서비스 계층 | BR-PT-02(기간 겹침), BR-PT-03(진행 중 1개) — 형제 회차를 봐야 판단 가능하므로 엔티티가 아님 |
| 서비스 계층 | 태그/장르 자동 소멸 (COUNT → DELETE) |
| 서비스 계층 | `Game.name` 수정 시 해당 게임을 담은 **모든** 항목의 `displayName` 갱신 |
| 시드 | `Platform` / `Device` 초기 목록 (OI-05) |

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