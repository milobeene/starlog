# 게임 백로그 — API 설계서 v0.2

| 항목 | 내용 |
|---|---|
| 문서 버전 | v0.2 |
| 최종 수정 | 2026-08-21 |
| 상태 | **구현 완료** — Phase 2 H-0~H-6 반영 |
| 기준 명세 | 기능명세서 v1.5 (`docs/spec-v1.5.md`), DTO 설계서 v0.1 (`docs/dto-design-v0.1.md`) |

> v0.1은 화면에서 역산한 초안이었다. v0.2는 **실제로 구현하고 p6spy로 재본 결과**를 반영한다.
> 바뀐 것: 쿼리 예산 정정, 엔드포인트 3종 추가, §4 미결 전부 해소.

> 화면에서 역산했다. 도메인에서 리소스를 뽑은 게 아니다.
> 근거는 스펙 §13 "API 방향" — **읽기는 화면 단위, 쓰기는 리소스 단위**.

---

## 0. 원칙

```
읽기   화면 단위로 한 번에    목록 카드가 5개 도메인을 걸친다. 리소스로 쪼개면 호출이 폭발한다
쓰기   리소스 단위로 따로     한 화면에 폼이 5개면 엔드포인트도 5개. 검증도 각각 다르다
```

- 응답은 **반드시 DTO**. 엔티티를 직접 반환하지 않는다 (NFR-A3)
- 변환은 **트랜잭션 안에서** 끝낸다. `open-in-view: false`라 컨트롤러에서 LAZY를 건드리면 터진다
- 조합 지점은 **조회 전용 서비스**. 화면 단위로 하나씩 둔다
- 모든 경로는 `/api` 아래

### 회원 식별 (Phase 3 이전 임시)

```
X-Member-Id: 1
```

`@LoginMember Long memberId` 커스텀 애노테이션 + `HandlerMethodArgumentResolver`로 받는다.

- Phase 3에서 **리졸버 구현만 세션 기반으로 갈아끼우면** 컨트롤러 시그니처가 그대로 산다
- 쿼리 파라미터(`?memberId=1`)로 두면 URL 설계가 오염되고 Phase 3에 전 경로를 고쳐야 한다

---

## 1. 읽기 — 화면 단위

### 1.1 백로그 목록 (화면 1)

```
GET /api/backlog
```

| 파라미터 | 값 | 근거 |
|---|---|---|
| `q` | 검색어 | FR-QRY-02. `displayName` 대상 |
| `status` | `PLAYING,BACKLOG` (복수) | FR-QRY-03 |
| `tagId` | 태그 id | 폴더 탐색 겸 필터 |
| `genreId` | 장르 id | FR-QRY-03 |
| `deviceId` / `platformAccountId` | id | FR-QRY-03 |
| `sort` | `lastPlayed`(기본) `rating` `releasedOn` `name` | FR-QRY-04 |
| `page` / `size` | 0부터 / 기본 20 | FR-QRY-01 |

**2차 정렬은 항상 최근 플레이순** (BR-QRY-01). 안 정하면 페이징이 깨진다.

```jsonc
{
  "page": 0, "size": 20, "totalElements": 137, "totalPages": 7,
  "items": [
    {
      "entryId": 12,
      "coverUrl": "https://.../cover.png",     // 없으면 기본 이미지 URL
      "displayName": "링 피트 어드벤처",
      "genres": ["피트니스", "기능성"],          // 개인 있으면 개인, 없으면 마스터
      "rating": 83.0,                          // null 가능
      "status": "PLAYING",
      "lastPlaythrough": {                     // null 가능 (회차 0개)
        "sequenceNo": 2,
        "startedOn": "2026-05-27",
        "finishedOn": null,
        "deviceName": "Nintendo Switch",
        "emulatorName": null
      }
    }
  ]
}
```

**태그는 카드에 넣지 않는다.** 폴더/모음집처럼 묶는 탐색 수단이다 (§6.7).

#### 쿼리 예산 — 5방 (Phase 6 L-3에서 재측정)

```
1방  항목 + game + lastPlaythrough + device + emulator   전부 ~ToOne → join fetch (페이징 유지)
1방  개인 장르 연결 (backlog_entry_genre, batch size)
1방  장르 본체     (genre, batch size)          ← v0.1이 빠뜨린 자리
1방  마스터 장르   (game_master_genre, batch size)
1방  개인 커버     (cover_image, entryId IN)    ← Phase 5(K-5)에서 추가
```

**커버가 1방을 더한다.** `CoverImage`가 FK를 가진 `@OneToOne` 주인이라 `BacklogEntry`에 역방향이 없고,
`mappedBy @OneToOne`은 지연 로딩이 안 되어 두면 항목마다 SELECT가 나간다.
그래서 페이지의 entryId를 모아 `IN`으로 한 번에 읽는다.

**검색·필터를 걸어도 5방 그대로다** — 태그·장르·기기·계정 필터가 전부 `exists` 서브쿼리라
별도 쿼리가 아니라 `where` 절에 들어간다. 상세는 12방이고, **회차 수가 늘어도 안 는다.**

이 숫자는 `QueryCountTest`가 Hibernate 통계로 감시한다 — 절대값이 아니라
**"항목 수에 비례하지 않는다"** 를 단언한다. 조인 구조가 바뀌면 절대값은 달라져도 되지만,
비례하기 시작하면 그건 언제나 버그다.

**v0.1은 3방으로 잡았는데 실제로는 4방이다.** `BacklogEntryGenre.genre`가 LAZY `@ManyToOne`이라
조인 테이블에서 장르 본체로 가는 hop이 한 단계 더 있다. batch size가 없으면 이게 항목 수만큼 터진다
(3항목에 8방을 실제로 관측했다).

페이징을 걸면 count 쿼리가 붙어 5방. 총 개수가 페이지 크기보다 작으면 스프링이 count를 생략한다.
**중요한 건 항목 수가 늘어도 이 숫자가 안 늘어난다는 것이다.**

`lastPlaythrough` 비정규화(§7.2)가 없으면 이 자리가 항목 수만큼의 쿼리가 된다. 컬렉션 fetch join은 페이징을 깨므로(§6.8) 우회할 수 없다.

> **커버 이미지는 아직 응답에서 항상 `null`이다.** `CoverImage`가 FK를 가진 주인이라 역참조가 없고,
> 무엇보다 Phase 5(K) 전까지 행이 생길 경로가 없다. 죽은 조인을 미리 붙이지 않았다.

### 1.1.1 통계 (화면 3, Phase 6 L-5 신설)

```
GET /api/stats/genres                        장르별 분포          FR-STAT-01
GET /api/stats/completions?unit=month|year   기간별 완료 수       FR-STAT-02
GET /api/stats/playtime?limit=10             총합 + 게임별 순위   FR-STAT-03
GET /api/stats/spending                      지출 2축             FR-STAT-04
GET /api/stats/spending/monthly              월별 지출 추이       FR-STAT-07
```

**대시보드가 필요로 하는 것 대부분은 이미 있는 API로 된다** (v1.7 확인):

| 타일 | 어떻게 |
|---|---|
| 최근 플레이 5 / 최고 별점 5 | `GET /api/backlog?sort=lastPlayed\|rating&size=5` |
| **최다 플레이 5** | `?sort=playtime&size=5` — **정렬 1종 신설** |
| "더 보기" → 라이브러리 그리드 | 같은 `sort`를 그대로 넘긴다. 프론트 라우팅만 |
| 총 게임 수 / 완료 수 / 플레이 중 수 | `GET /api/backlog/facets` 의 `statuses` |
| 플레이 중 이름 리스트 | `?status=PLAYING` |
| 총 플레이 시간 | `GET /api/stats/playtime` |
| 월별 지출 꺾은선 | **신설** (아래) |

```jsonc
// GET /api/stats/spending/monthly
{ "currencies": ["KRW", "USD"],
  "months": [{ "period": "2026-01", "amounts": { "KRW": 89800, "USD": 19.99 } }],
  "yearlyAverages": [{ "year": 2026, "amounts": { "KRW": 45000, "USD": 12.50 } }] }
```

- **구독료는 날짜가 없어 기간을 월별로 펼친다.** 취득은 `acquiredOn`으로 바로 묶인다
- **연도별 월평균의 분모는 12개월 고정**이다. 데이터 있는 달만으로 나누면
  연초에 몰아 산 해가 실제보다 높게 나와 해끼리 비교가 안 된다

**한 엔드포인트로 묶지 않은 이유**는 facets와 같다 — 화면이 필요한 타일만 부른다.
대시보드 상단의 전체·상태별 수치는 **`/api/backlog/facets`가 이미 준다.** 여기서 또 세지 않는다.

```jsonc
// GET /api/stats/playtime
{ "totalHours": 105, "recordedEntries": 2,
  "top": [{ "entryId": 12, "displayName": "링 피트 어드벤처", "hours": 100 }] }

// GET /api/stats/spending — 두 축도, 통화도 합치지 않는다
{ "purchases":     [{ "currency": "KRW", "total": 16500.00 }, { "currency": "USD", "total": 19.99 }],
  "subscriptions": [{ "currency": "KRW", "total": 50100.00 }] }
```

- **장르별은 쿼리 2방이다.** §6.7의 폴백이 "개인 장르가 1개라도 있으면 개인 것만, 없으면 마스터 것"이라
  항목마다 분기가 갈린다. SQL `group by`로는 표현이 안 돼 두 집합을 따로 세고 합친다
- **완료는 회차 기준이다.** 항목 상태로 세면 3회차까지 깬 게임이 1로만 잡혀
  "그 해에 몇 번 끝냈나"가 틀린다
- **지출의 통화를 합치지 않는다** (BR-ACQ-01 + Money가 ISO 4217). 환산에는 환율이 필요하고 범위 밖이다.
  더해버리면 조용히 틀린 숫자가 나간다
- **구독료 결제 횟수 규칙은 스펙에 없어 여기서 정했다** — `시작월(연) 포함, 종료일(없으면 오늘)까지의 주기 수`.
  6월 시작·8월 종료 월간 구독은 6·7·8 세 번

#### 목록 필터 확장 (Phase 8)

```
GET /api/backlog/developers   개발사 사전 (자동완성 선택지). 표시값 기준이라 쿼리 두 방

developer=닌텐도      개발사 부분 일치. 오버라이드가 있으면 그쪽, 없으면 마스터 (§7.1)
releaseYear=2017     releasedOnResolved의 연도
platformId=3         취득의 플랫폼 (Steam·Nintendo…)
genreName=메트로배니아  **표시값 기준 장르** — 아래 참고
```

- **`genreName`이 `genreId`와 따로 있는 이유** — 개인 장르는 마스터를 *덮어쓴다*(§6.7).
  id로 거르면 개인 장르가 없는 항목의 마스터 장르가 필터에 안 걸려,
  화면에 보이는 값과 필터 결과가 어긋난다. 조건은 두 갈래다:
  개인 장르에서 이름이 맞거나, **개인 장르가 아예 없으면서** 마스터 장르에서 맞거나
- 선택지 목록은 `GET /api/stats/genres`가 준다 (그쪽도 같은 폴백을 쓴다)
- 전부 AND로 겹친다

### 1.2 필터 사이드바 (화면 1 부속)

```
GET /api/backlog/facets
```

집계 5방. **목록과 한 응답에 묶지 않았다** — 페이지를 넘길 때마다 집계가 따라붙을 이유가 없다.

```jsonc
{
  "tags":   [{ "tagId": 3, "name": "명작", "count": 12 }],
  "genres": [{ "genreId": 7, "name": "메트로배니아", "count": 5 }],
  "statuses": [{ "status": "PLAYING", "count": 2 }],
  "devices": [{ "deviceId": 1, "name": "Nintendo Switch", "count": 23 }],
  "platformAccounts": [{ "accountId": 4, "label": "본계정", "count": 31 }]
}
```

- 태그·장르 목록은 **개인 사전** 기준이다 (§6.8). 어느 항목에도 안 붙은 것과 **삭제된 항목에만 붙은 것**은 안 나온다
- `count`는 신규 쿼리가 필요하다 (지금 `findUsedByMemberId`는 이름만 준다) → H-4에서 JPQL 생성자 표현식으로 구현
- **`platformAccounts` 카운트는 취득 기준이다** (v0.2 결정). 회차에도 계정이 붙지만 의미가 다르다 —
  취득의 계정은 "그 계정으로 가진 게임", 회차의 계정은 "그때 어느 계정으로 플레이했나"다.
  필터의 뜻은 전자에 가깝다. 삭제된 계정은 세지 않는다 (어차피 선택지에 없다)

### 1.2.1 사이드바 전체 목록 (Phase 8 신설)

```
GET /api/backlog/names
```

```jsonc
[{ "entryId": 12, "displayName": "링 피트 어드벤처" }]
```

- **전 항목, 이름순(대소문자 무시), 페이징 없음.** 사이드바가 전량을 한 번에 그린다
- 카드 API를 안 쓰는 이유 — 이름만 필요한데 카드는 join fetch 3방을 끌고 온다.
  생성자 표현식 프로젝션이라 두 컬럼만 읽는다
- 정렬은 `lower(displayName)` — 바이너리 정렬이면 대문자 게임이 전부 앞으로 몰린다

### 1.3 백로그 상세 (화면 2)

```
GET /api/backlog/{entryId}
```

**표시값과 마스터 원본값을 둘 다 준다.** 편집 화면이 "내가 뭘 덮어썼는지"를 보여줘야 하고, 정보가 많은 편이 프론트에서 자르기 쉽다.

**v1.7 — 커버가 `resolved` 안으로 들어왔다.** 그전에는 `coverUrl`만 밖에 따로 있고
마스터 커버는 `master.coverImageId`에 있어서, 장르는 서버가 합성하는데 커버만 화면이 합성하는
비대칭이 있었다. `source`로 어느 쪽이 이겼는지 서버가 알려주고 **크기 선택만 화면 몫**으로 남긴다
(마스터 커버는 자리마다 크기가 달라야 해서 서버가 URL을 확정하면 안 된다, §6.10).

**정가는 자리만 두고 화면에 출력하지 않는다 (v1.7).** IGDB가 가격을 주지 않아 `master.listPrice`는
사실상 항상 null이고, `listPriceOverride`는 **덮을 대상이 없는 오버라이드**로 떠 있다.
응답에는 계약 유지를 위해 남기되, **화면이 보여주는 금액은 취득 섹션의 `acquisitions[].price`뿐이다** —
할인가로 산 경우가 많아 정가보다 그쪽이 실제 정보다.

**상세 타임라인은 프론트가 계산한다.** 서버는 원자료만 준다:
`createdAt`(담은 날짜) → `acquisitions[].acquiredOn`(취득) →
`min(playthroughs[].startedOn)`(첫 플레이) → `min(finishedOn where COMPLETED)`(첫 완주) →
`max(COALESCE(finishedOn, startedOn))`(마지막 플레이).
마지막 값은 서버의 `lastPlayedOn`(§7.6)과 같은 식이라 결과가 일치한다 — 그래서 따로 안 내린다.

```jsonc
{
  "entryId": 12,
  "status": "PLAYING",
  "createdAt": "2025-12-13T10:22:00",        // 담은 날짜. 상세 타임라인의 기점

  "resolved": {                              // 화면에 뿌리는 값 — 표시값 규칙 7개가 전부 여기 모인다
    "name": "링 피트 어드벤처",
    "developers": ["Nintendo"],
    "publishers": ["Nintendo"],
    "releasedOn": "2019-10-18",
    "listPrice": { "amount": 89800, "currency": "KRW" },   // **화면에는 출력하지 않는다** (아래)
    "genres": ["피트니스", "기능성"],
    "cover": {                               // v1.7 — 밖에 나가 있던 coverUrl을 여기로 합쳤다
      "source": "PERSONAL",                  // PERSONAL | MASTER | NONE
      "url": "https://cdn/covers/1/12/....jpg",   // 개인 업로드일 때만
      "imageId": null                        // 마스터일 때만. 크기는 화면이 고른다
    }
  },
  "master": {                                // 편집 화면의 "마스터: ~" 힌트 + 상세 화면의 게임 정보
    "gameId": 5,
    "name": "Ring Fit Adventure",
    "developers": ["Nintendo"],
    "publishers": ["Nintendo"],
    "releasedOn": "2019-10-18",
    "genres": ["Sports"],
    "source": "IGDB",

    "coverImageId": "cobcnq",                // 세로 박스아트 (t_cover_* 로 조합)
    "bannerImageId": "ar584c",               // 가로 키아트 (상세 상단)
    "summary": "Ring Fit Adventure is ...",  // 영문 원문
    "storyline": null,
    "igdbRating": 78.4,                      // 유저 평점 0~100
    "igdbRatingCount": 312,
    "releasePlatforms": ["Switch"],          // ⚠️ 하드웨어 기종. Platform 엔티티와 다름
    "mainStoryHours": 25,                    // Main Story
    "mainExtraHours": 37,                    // Main + Extra
    "completionistHours": 61,                // Completionist
    "timeToBeatSamples": 41,                 // 퍼센트로 환산하지 않는다
    "listPrice": null                        // IGDB가 안 주므로 사실상 항상 null
  },
  "overrides": {                             // 편집 폼의 현재 입력값. null = 안 덮어씀
    "name": null,
    "developers": [], "publishers": [],
    "releasedOn": null, "listPrice": null
  },

  "personalRecord": { "rating": 83.0, "playTimeHours": 40, "memo": "..." },
  "tags":   ["명작", "운동"],
  "genres": ["피트니스", "기능성"],            // 개인 장르 원본 (폴백 전)

  "playthroughs": [
    { "playthroughId": 31, "sequenceNo": 1,
      "startedOn": "2022-01-01", "finishedOn": "2023-01-01",
      "status": "COMPLETED", "label": null,
      "device": { "deviceId": 1, "name": "Nintendo Switch" },
      "platformAccount": null, "emulator": null, "inputMethod": "NINTENDO" }
  ],
  "acquisitions": [
    { "acquisitionId": 8, "method": "PURCHASED",
      "platform": { "platformId": 2, "name": "Nintendo" },
      "platformAccount": null, "subscription": null,
      "price": { "amount": 89800, "currency": "KRW" },
      "acquiredOn": "2022-01-01", "label": null }
  ]
}
```

> **쿼리 11방** (v0.2 측정). 항목+game / 태그 / 회차(ToOne join fetch) / 취득(ToOne join fetch) +
> `@ElementCollection` 7종. 회차 수에는 비례하지 않는다.

> **삭제된 플랫폼 계정도 그대로 실린다.** 과거 기록에서는 계정 이름이 계속 보여야 한다 (§6.5). 선택지 목록(§1.5)에서만 빠진다.

### 1.4 프로필 / 설정 (화면 4)

```
GET /api/me
```

```jsonc
{
  "profile": { "memberId": 1, "email": "...", "nickname": "밀로", "memo": "..." },
  "platformAccounts": [
    { "accountId": 4, "label": "본계정", "platform": { "platformId": 1, "name": "Steam" } }
  ],
  "devices": [
    { "memberDeviceId": 2, "label": "거실용", "memo": "...",
      "device": { "deviceId": 1, "name": "Nintendo Switch" } }
  ],
  "subscriptions": [
    { "subscriptionId": 3, "serviceName": "Xbox Game Pass",
      "startedOn": "2026-01-01", "endedOn": null,
      "fee": { "amount": 11900, "currency": "KRW" },
      "billingCycle": "MONTHLY", "active": true }
  ]
}
```

### 1.5 편집 폼 선택지 (화면 2·4 공용)

```
GET /api/me/options
```

```jsonc
{
  "platforms": [{ "platformId": 1, "name": "Steam" }],       // 마스터 전체
  "devices":   [{ "deviceId": 1, "name": "Nintendo Switch" }], // 마스터 전체 (BR-PT-05)
  "emulators": [{ "emulatorId": 1, "name": "Ryujinx" }],
  "platformAccounts": [ /* 삭제된 것 제외 */ ],
  "subscriptions":    [ /* 구독 연결용 */ ],
  "tagDictionary":    ["명작", "운동"],                        // 자동완성 (FR-TAG-04)
  "genreDictionary":  ["피트니스", "기능성"]
}
```

**기기는 마스터 전체를 준다.** 보유 기기 목록은 우선 표시일 뿐 제약이 아니다 (BR-PT-05 — 친구 집에서 빌려 플레이한 기록).

`facets`(§1.2)와 겹쳐 보이지만 다르다. facets는 **카운트가 있고 사용 중인 것만**, options는 **카운트가 없고 고를 수 있는 전부**다.

---

## 2. 쓰기 — 리소스 단위

### 2.1 백로그 항목

| 메서드 | 경로 | 대응 서비스 |
|---|---|---|
| `POST` | `/api/backlog` | `addToBacklog` |
| `POST` | `/api/backlog/{id}/revive` | `revive` |
| `DELETE` | `/api/backlog/{id}` | `delete` (소프트) |
| `PUT` | `/api/backlog/{id}/personal-record` | `updatePersonalRecord` |
| `PUT` | `/api/backlog/{id}/overrides` | `updateOverrides` |
| `PUT` | `/api/backlog/{id}/tags` | `replaceTags` |
| `PUT` | `/api/backlog/{id}/genres` | `replaceGenres` |

`POST /api/backlog` 본문 (J-3에서 외부 id 추가):

```jsonc
{ "gameId": 5 }           // 마스터에 이미 있음 → 외부 호출 0회
{ "externalId": "1020" }  // 마스터에 없음 → 상세 1회 호출 → 마스터 저장 → 담기
```

둘 중 하나는 반드시 있어야 한다(없으면 400). 프론트는 검색 응답의 두 필드를 그대로 실어 보내면 되고,
캐시 여부를 판단하지 않는다 — 그건 `GameResolver`가 한다.

**전부 `PUT`인 이유** — 서비스가 전부 전체 교체다. 부분 수정 의미론이 없으므로 `PATCH`가 아니다.

`revive`가 `POST`인 이유 — 멱등하지 않고(이미 살아있으면 예외) 리소스 상태를 바꾸는 **행위**다.

### 2.2 회차 / 취득

```
POST   /api/backlog/{entryId}/playthroughs      추가 (부모가 필요)
PUT    /api/playthroughs/{id}                   수정
DELETE /api/playthroughs/{id}                   삭제 (물리)

POST   /api/backlog/{entryId}/acquisitions
PUT    /api/acquisitions/{id}
DELETE /api/acquisitions/{id}
```

**수정·삭제는 부모 경로를 붙이지 않는다.** id가 전역 유니크라 필요 없고, `/backlog/{eid}/playthroughs/{pid}`로 두면 둘이 안 맞을 때를 검사해야 한다. 소유권은 어차피 서버가 `BacklogEntryFinder`로 확인한다.

### 2.4 인증 (Phase 3)

```
POST /api/auth/signup      가입 (FR-AUTH-01)
```

```jsonc
// 요청
{ "email": "milo@example.com", "password": "********", "nickname": "밀로" }
// 201 + Location: /api/me
{ "id": 1 }
```

| 상태 | 언제 |
|---|---|
| `400 INVALID_INPUT` | 이메일 형식·비밀번호 길이(4~64)·닉네임 누락 |
| `409 CONFLICT` | 이미 가입된 이메일 (앱 검증) |
| `409 CONSTRAINT_VIOLATION` | 동시 요청이 앱 검증을 통과한 경우 (DB 유니크) |

- 이메일은 **소문자로 정규화**해 저장한다. 유니크 제약이 대소문자를 구분하기 때문
- 비밀번호 4~64자 — 상한 64는 BCrypt가 72바이트 초과분을 조용히 버리기 때문. 하한은 개인용이라 4로 낮췄다
- 중복 검사는 `deletedAt`을 보지 않는다. 탈퇴 유예 중인 이메일도 재사용 불가 (BR-AUTH-02)
- **가입 직후 `emailVerified = false`.** 로그인 제한은 I-4에서 붙는다

```
POST /api/auth/login       로그인 (FR-AUTH-03)
POST /api/auth/logout      로그아웃 (FR-AUTH-04)
```

**컨트롤러 메서드가 없다.** 시큐리티 필터가 이 두 경로를 가로채 처리한다. 코드에서 찾으면 `SecurityConfig`에 있다.

로그인은 **JSON이 아니라 form 형식**이다 (`application/x-www-form-urlencoded`):

```
email=milo@example.com&password=********
```

| 상태 | 응답 |
|---|---|
| `200` | `{ "id": 1, "email": "...", "role": "USER", "withdrawalPending": false }` + `JSESSIONID` 쿠키 |
| `401 AUTHENTICATION_FAILED` | 비밀번호 오류·없는 계정 **동일 응답** (NFR-S3) |

로그아웃은 성공 시 `204`. 세션을 무효화하고 `JSESSIONID`를 지운다.

```
POST /api/auth/email-verification           인증 확인 (FR-AUTH-02)
POST /api/auth/email-verification/resend    재발송
```

```jsonc
// 인증 확인 — 메일 링크의 토큰을 프론트가 읽어 보낸다
{ "token": "sVm1Ljuscn1epis2rZudpgVv..." }   // → 204

// 재발송
{ "email": "milo@example.com" }              // → 202 (항상)
```

| 상태 | 언제 |
|---|---|
| `204` | 인증 완료 |
| `400 INVALID_INPUT` | 없는 토큰 / 만료 / **이미 사용됨** — 세 경우를 구분해 알려주지 않는다 |
| `202` | 재발송. 가입 여부·인증 여부·스로틀 여부와 **무관하게 항상 같은 응답** (NFR-S3) |

- 토큰은 256비트 난수, 유효 24시간, **1회용**. DB에는 **SHA-256 해시만** 저장한다 (NFR-S2)
- 비밀번호와 달리 BCrypt를 쓰지 않는다 — salt 때문에 해시로 조회가 불가능하고, 고엔트로피라 느릴 이유도 없다
- 재발송 최소 간격 60초 (NFR-S9)
- **미인증 계정의 로그인은 `403 EMAIL_NOT_VERIFIED`.** 비밀번호를 대조한 **뒤에** 막는다 —
  먼저 막으면 아무 비밀번호나 넣어보는 것만으로 "가입돼 있고 미인증"이 새어나간다
- 이 두 경로는 인증 없이 열려 있다. 토큰 자체가 신분증이다

#### 인증이 없는 요청

```jsonc
// 401 — 302 리다이렉트가 아니라 항상 JSON
{ "code": "UNAUTHORIZED", "message": "로그인이 필요합니다" }
```

#### CSRF (OI-14 — 로컬 기준 결론)

세션 쿠키는 브라우저가 자동으로 실어 보내므로, 다른 사이트가 우리 API로 쓰기 요청을 유도할 수 있다.
그래서 **쿠키로 받은 토큰을 헤더로 되보내는** 방식으로 막는다.

```
1. 아무 GET 요청     → 응답에 XSRF-TOKEN 쿠키
2. 쓰기 요청          → X-XSRF-TOKEN 헤더에 그 값을 실어 보냄
```

- 토큰 없는 `POST`/`PUT`/`DELETE`는 **403**. `GET`은 대상이 아니다
- **로그인에 성공하면 토큰이 새로 발급된다.** 응답의 `XSRF-TOKEN` 쿠키로 갱신해야 한다 —
  안 하면 로그인 직후 모든 쓰기가 403이 된다
- 크로스 도메인 배포(`vercel.app` ↔ `onrender.com`, `SameSite=None`) 재검토는 Phase 9

```
POST /api/auth/password-reset/request       재설정 요청 (FR-AUTH-05)
POST /api/auth/password-reset               재설정 확정
```

```jsonc
{ "email": "milo@example.com" }                              // → 202 (항상)
{ "token": "...", "newPassword": "********" }                // → 204
```

- 토큰 유효 **30분** (인증 토큰 24시간보다 짧다). 계정을 통째로 넘기는 열쇠라 노출 창을 좁힌다
- 비밀번호 규칙은 가입과 같다(4~64자). 여기만 느슨하면 재설정이 우회로가 된다
- 성공하면 **그 회원의 기존 세션이 전부 끊기고**, 남아 있던 다른 재설정 링크도 함께 폐기된다
- ⚠️ 세션 무효화는 `SessionRegistry`(JVM 메모리) 기반이라 **단일 인스턴스 전제**다.
  다중화하면 Phase 9의 Spring Session(JDBC)로 갈아타야 한다 (NFR-O3)

#### 비밀번호 변경·설정 (Phase 8 신설)

```
PUT /api/me/password     { "currentPassword": "…", "newPassword": "…" }   → 204
```

- **`currentPassword`가 선택인 이유** — 구글로 가입한 계정은 비밀번호가 **아예 없다**(BR-AUTH-01).
  확인할 대상이 없으므로 처음 설정하는 경로로 쓴다. 화면도 그 칸을 숨긴다
- 비밀번호가 있는 계정은 **반드시 대조한다.** 안 하면 세션 탈취만으로 비밀번호를 갈아치우고
  계정을 통째로 가져가는 경로가 생긴다
- `400 INVALID_INPUT` — 현재 비밀번호 불일치 · 새 비밀번호 길이(4~64)
- 이 경로로 비밀번호를 만들면 **구글 연결 해제도 열린다** (BR-AUTH-01)
- 재설정(§2.4)과 달리 **다른 세션을 끊지 않는다** — 현재 값을 확인하고 하는 변경이라 본인이 확실하다

### 2.5 탈퇴 / 복구 (Phase 3)

```
DELETE /api/me            탈퇴 요청 — 30일 유예 (FR-AUTH-09)
POST   /api/me/restore    유예 중 복구 (FR-AUTH-10)
```

- 탈퇴 요청 즉시 **세션이 끊긴다**. 세션에 실린 권한은 로그인 시점에 굳기 때문에,
  안 끊으면 유예 상태인데도 기존 탭에서는 계속 정상 회원으로 돌아다닌다
- 유예 중 계정은 **인증은 통과하고 인가만 제한**된다 — 권한이 `ROLE_USER` 대신
  `ROLE_PENDING_DELETION`이 되어 `/api/me/restore` 외에는 전부 403
- 로그인 응답이 상태를 알려준다: `{ "id": 1, "email": "...", "withdrawalPending": true }`
- 유예 중 이메일은 재사용할 수 없다 (BR-AUTH-02)
- 30일이 지나면 배치가 물리 삭제한다 (FR-SYS-06)

### 2.6 관리자 (Phase 3)

```
GET  /api/admin/members                                  회원 목록 (FR-ADM-03)
GET  /api/admin/audit-logs                               감사 로그 조회 (FR-ADM-05)
PUT  /api/admin/games/{gameId}/name                      마스터 게임명 수정 + 전파 (FR-ADM-01)
PUT  /api/admin/games/{gameId}                           마스터 정보 수정 + 전파 (FR-ADM-01)
POST /api/admin/games/{sourceId}/merge-into/{targetId}   중복 마스터 병합 (FR-ADM-02)
POST /api/admin/platforms  ·  PUT /api/admin/platforms/{id}     플랫폼 마스터 (FR-ADM-04)
POST /api/admin/devices    ·  PUT /api/admin/devices/{id}       기기 마스터
POST /api/admin/emulators  ·  PUT /api/admin/emulators/{id}     에뮬레이터 마스터
```

**병합(FR-ADM-02)** — source의 항목을 target으로 옮기고 source를 지운다. 마스터는 원래 삭제하지
않지만(§7.4) 병합은 그 예외다. 옮길 때 `displayName`·`releasedOnResolved`를 다시 계산하되
**개인 오버라이드가 있는 항목은 표시값이 안 바뀐다**.

| 상태 | 언제 |
|---|---|
| `409 CONFLICT` | 양쪽을 모두 담은 회원이 있다 — `(member, game)` 유니크 제약에 걸린다. 어느 기록을 살릴지 서버가 정할 수 없어 관리자가 먼저 정리해야 한다 |
| `400 INVALID_INPUT` | 같은 게임끼리 병합 |

**마스터 관리(FR-ADM-04)** — 추가와 이름 수정만. **삭제는 없다** — 회차·취득이 참조하고 있어
지우면 과거 기록이 깨진다. 오타 정정 경로가 이름 수정뿐인 이유다.

### 2.7 구글 계정 연동 (Phase 3, I-6)

```
GET    /oauth2/authorization/google    연동 시작 (연결·로그인 공용, 시큐리티 필터가 처리)
DELETE /api/me/google                  연결 해제 (FR-AUTH-08)
```

> **결과는 JSON이 아니라 리다이렉트다 (Phase 8).** OAuth는 브라우저 통째 이동이라
> JSON을 쓰면 `{"code":"LINKED"}` 원문이 사용자에게 그대로 보인다.
> 서버는 `?google=CODE`만 실어 프론트로 돌려보내고 **문구는 화면이 고른다.**
>
> | 결과 | 도착지 |
> |---|---|
> | 로그인·가입 성공 | `/dashboard` (유예 중이면 `/restore`) |
> | 연결 성공·충돌 | `/settings?google=LINKED` · `ALREADY_LINKED` |
> | 나머지 실패 | `/login?google=EMAIL_ALREADY_REGISTERED` · `EMAIL_REQUIRED` · `EMAIL_NOT_VERIFIED` · `FAILED` |

**같은 콜백이 두 가지로 갈린다.**

| 상황 | 결과 |
|---|---|
| 로그인한 상태에서 시작 | **연결** → `200 { "code": "LINKED" }` |
| 로그인 안 한 상태 + 연결된 회원 있음 | **로그인** → `200 { id, email, role, withdrawalPending }` |
| 로그인 안 한 상태 + 연결된 회원 없음 + 이메일 미가입 | **가입** (FR-AUTH-12) → 로그인 응답과 동일 |
| 로그인 안 한 상태 + **이메일이 이미 가입됨** | `409 EMAIL_ALREADY_REGISTERED` — 이어붙이지 않는다 |
| 구글이 이메일을 안 줌 | `403 GOOGLE_EMAIL_REQUIRED` |
| 이메일 미인증 상태 | `403 EMAIL_NOT_VERIFIED` (이메일 가입과 같은 규칙) |
| 이미 다른 회원에 연결된 구글 계정 | `409 CONFLICT` |

- 저장하는 값은 이메일이 아니라 구글의 **`sub`**. 이메일은 바뀌고 재사용되지만 sub는 영구적이다
- **이메일이 같다고 자동 연결하지 않는다** — 공격자가 남의 이메일로 선점 가입해두면 계정을 통째로 넘겨받는다 (§6.1).
  가입은 허용하되 이메일이 겹치면 거부하고 "로그인 후 연결"로 안내한다
- 가입 시 비밀번호는 `null`이다. **`PUT /api/me/password`로 만들 수 있고**(§2.5 위), 재설정 경로로도 되며,
  만들고 나면 구글 연결 해제도 가능해진다 (BR-AUTH-01)
- 해제는 **비밀번호가 있어야** 가능하다 (BR-AUTH-01). 없으면 로그인 수단이 하나도 안 남는다
- 자격증명(환경변수)이 없으면 **oauth2Login이 체인에 아예 안 붙는다.** 로컬·CI가 구글 설정 없이 돌아야 하기 때문

필요한 환경변수:
```
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET
```
리다이렉트 URI: `{서버주소}/login/oauth2/code/google`

**게임명만 경로가 따로인 이유** — 이름 변경은 그 게임을 담은 **모든 항목의 `displayName`**을
갱신해야 해서 전파 경로가 다르고, 전체 교체 요청에 실려 실수로 바뀔 때의 피해도 크다.

**관리자 범위는 "조회 + 마스터 수정"으로 확정** (Phase 3 논의). 회원 정지·강제 탈퇴·비밀번호
초기화·권한 부여는 **만들지 않는다** — 스펙에 없는 기능이고, 단일 관리자 습작에서 강한 권한을
먼저 만들면 되돌리기·감사 요구만 무거워진다. 필요해지면 그때 FR을 추가한다.

- `/api/admin/**`는 `ROLE_ADMIN`. 인가는 컨트롤러 애노테이션이 아니라 `SecurityConfig`
  경로 규칙 한 곳에 모여 있다
- **이 경로의 모든 요청은 조회를 포함해 감사 로그에 남는다** (NFR-S8).
  거부된 시도(`DENIED GET /api/admin/members`)도 남는다 — 오히려 더 중요한 신호다
- 관리자 계정은 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 환경변수로 기동 시 생성·승격한다 (OI-07)
- 회원 목록에 비밀번호 해시는 실리지 않는다

#### CSRF 토큰이 새로 발급되는 순간

시큐리티는 다음 세 순간에 **기존 토큰을 폐기한다.** 프론트는 응답의 `XSRF-TOKEN` 쿠키로 매번 갱신해야 한다.

| 순간 | 이유 |
|---|---|
| 로그인 성공 | 세션 고정 공격 방어의 일부로 토큰 회전 |
| 로그아웃 | 쿠키 삭제 |
| 세션 강제 만료 | 비밀번호 재설정·탈퇴로 서버가 세션을 끊었을 때 |

갱신을 놓치면 **다음 쓰기 요청이 전부 403**이 된다. 로그아웃 직후 로그인조차 안 되는 상태가 된다.

#### 회원 식별 — `X-Member-Id`는 dev·test 전용으로 격리됐다

세션이 있으면 헤더는 필요 없다. 헤더 경로는 **dev·test 프로필에만 존재하는 필터**가 처리하며
운영 프로필에는 그 빈 자체가 만들어지지 않는다.

### 2.3 프로필 / 설정

```
PUT    /api/me/profile

POST   /api/me/platform-accounts
PUT    /api/me/platform-accounts/{id}
DELETE /api/me/platform-accounts/{id}            소프트
POST   /api/me/platform-accounts/{id}/revive

POST   /api/me/devices
PUT    /api/me/devices/{id}
DELETE /api/me/devices/{id}                      물리

POST   /api/me/subscriptions
PUT    /api/me/subscriptions/{id}
DELETE /api/me/subscriptions/{id}                물리
```

### 2.4 게임 검색 / 등록 (v0.2 신설 → Phase 4에서 확장)

```
GET  /api/games?q=knight       로컬 수동 등록 + IGDB 검색 결과
POST /api/games                수동 등록 (FR-GAME-04)
```

**v0.1에 구멍이 있었다** — `POST /api/backlog`가 `gameId`를 받는데 그 id를 얻을 경로가 없었다.
v0.2에서 로컬 마스터 검색으로 메웠고, **J-2에서 외부 DB를 붙였다** (J-1~J-6 RAWG → J-7 IGDB).
회원 식별이 없는 유일한 조회다 (마스터는 공용 데이터).

검색 응답 (J-2에서 `externalId` 추가, `gameId`가 nullable이 됨):

```jsonc
[
  { "gameId": 5,    "externalId": null,    "name": "동네 오락실 게임",  "releasedOn": "1998-05-01", "source": "MANUAL", "coverImageId": null },
  { "gameId": 12,   "externalId": "14593", "name": "할로우 나이트",     "releasedOn": "2017-02-24", "source": "IGDB",   "coverImageId": "cobfzp" },
  { "gameId": null, "externalId": "1020",  "name": "Grand Theft Auto V", "releasedOn": "2013-09-17", "source": "IGDB", "coverImageId": "co2lbd" }
]
```

- `gameId != null` → 이미 마스터에 있다. 담을 때 외부 호출 0회 (FR-GAME-03)
- `gameId == null` → 외부 DB에만 있다. 담는 순간 상세 1회 호출 후 마스터에 저장 (FR-GAME-02)
- 마스터에 있는 게임은 **마스터 값이 이긴다** — 관리자가 고친 이름이 원본으로 되돌아가면 안 된다
- 로컬 검색은 `MANUAL`만 본다. `IGDB` 소스는 외부 결과에 다시 나오므로 같은 게임이 두 줄로 뜨지 않는다
- **외부 DB 장애면 502.** 로컬 결과만 조용히 주지 않는다 — 사용자가 "외부에 없는 게임"으로 오해한다 (FR-SYS-04)
- `coverImageId`는 검색 결과 카드의 썸네일용이다. `t_cover_small`(90×120)로 조합한다

수동 등록 (`POST /api/games`) — 이름만 필수, 나머지는 전부 선택. 정가는 여기에만 있다(외부 DB는 가격을 안 준다).
등록 이후 수정은 관리자만이라(AUTH-P2) `PUT /api/games/{id}`는 없다.

### 2.5 태그·장르 사전 (v0.2 신설)

```
PUT    /api/me/tags/{id}         이름 변경 (FR-TAG-02)
DELETE /api/me/tags/{id}         명시적 삭제
PUT    /api/me/genres/{id}
DELETE /api/me/genres/{id}
```

서비스에는 있는데 v0.1에 대응 경로가 없던 것. 태그를 **붙이고 떼는** 건 `PUT /api/backlog/{id}/tags`,
여기는 **사전 자체**를 고치는 곳이라 `/api/me` 아래다.

### 2.6 관리자 (인가는 Phase 3 / I-9)

```
PATCH /api/admin/games/{id}/name                 GameService.updateName — 전 회원 전파
POST  /api/admin/games/{id}/resync               IGDB 재동기화 (FR-GAME-05, J-5)
```

재동기화가 `POST`인 이유 — 멱등해 보이지만 "지금 시점의 외부 DB를 가져온다"는 행위고 `lastSyncedAt`이 매번 바뀐다.
`MANUAL` 게임은 원본이 없어 400. 개인 오버라이드와 **손으로 넣은 정가는 건드리지 않는다**(외부 DB가 가격을 안 주므로
전체 교체를 하면 매번 날아간다). 응답은 `{ nameChanged, renamedEntries, reorderedEntries }`.

---

## 3. 상태코드

| 코드 | 언제 |
|---|---|
| `200` | 조회, 수정 성공 |
| `201` | 생성 성공. `Location` 헤더에 새 리소스 경로 |
| `204` | 삭제 성공 |
| `400` | 입력값 오류 (검증 실패, 범위 위반) |
| `404` | 대상 없음 **또는 내 것이 아님** |
| `409` | 중복, 상태 충돌, **되살리기 필요** |
| `502` | 외부 API(IGDB) 장애. 작업을 취소하고 아무것도 저장하지 않는다 (FR-SYS-04, J-6) |

### ~~알려진 허용 리스크 — 참조 id의 소유권 미검사~~ → **해소됨 (v1.7)**

v0.2에서 "회차·취득의 `platformAccountId`가 소유권 검사 없이 연결된다.
1인 사용이라 참작하되 **Phase 3 인증을 붙일 때는 막아야 한다**"고 보류해둔 항목이다.

**Phase 3이 끝난 뒤에도 보류가 해제되지 않은 채 남아 있었고, 테스트 감사에서 드러났다.**
남의 계정 id를 넣으면 상세 응답에 그 라벨이 실릴 수 있었다 (NFR-S7 위반).

- `PlaythroughService`·`AcquisitionService`가 `platformAccountService.findOne(ownerId, id)`를 쓴다.
  남의 것이면 **404** — 403을 주면 "그 id는 존재한다"가 새어나간다
- **소프트 삭제된 계정은 통과시킨다.** 계정을 지웠다고 그 계정으로 플레이했던 과거 회차를
  못 고치게 되면 안 된다. 새로 고를 때 안 보이는 건 `findSelectable`이 맡는다
- `Device`·`Emulator`·`Platform`은 **마스터**라 이 검사가 없는 게 맞다 (BR-PT-05)

> **교훈** — "나중에 막는다"고 문서에 적어둔 보류는 그 시점이 와도 저절로 해제되지 않는다.
> 조건이 만료되는 항목은 해당 페이즈의 체크리스트에 넣어야 한다.

### 404 vs 403 — 남의 것은 404다

소유권 위반을 `403`으로 주면 **"그 id는 존재한다"**가 새어나간다. NFR-S7(타 회원 데이터 접근 차단)과 §6.8 조회 정책상 **없는 것처럼 답하는 게 맞다.**

이미 같은 방향으로 결정한 게 있다 — `BacklogService.findOne`은 소프트 삭제된 항목에 "삭제된 항목입니다"가 아니라 **"찾을 수 없습니다"**를 던진다 (v1.5 리뷰 D2).

### 409 되살리기 응답

```jsonc
// POST /api/backlog  → 409
{
  "code": "REVIVABLE",
  "message": "삭제된 항목이 있습니다. 복원하시겠습니까?",
  "targetId": 12,
  "reviveUrl": "/api/backlog/12/revive"
}
```

`RevivableException` 계열 하나로 `@ExceptionHandler`가 잡는다. 백로그 항목이든 플랫폼 계정이든 같은 형태다.

---

## 4. 미결 — 전부 해소됨 (v0.2)

| 항목 | 결론 | 어디에 |
|---|---|---|
| 예외를 4갈래로 | **완료.** `NotFound`/`InvalidInput`/`Conflict`/`Revivable` + `@RestControllerAdvice` | `common/exception/` (H-5) |
| 웹 Request DTO 분리 | **따로 둔다.** Request DTO가 `toCommand()`로 도메인 Command를 만든다. Bean Validation이 도메인으로 새지 않는다 | DTO 설계서 §2 (H-1) |
| 페이징 응답 | **자체 `PageResponse<T>`.** Spring `Page`의 내부 구조를 노출하지 않는다 | `common/dto/PageResponse` (H-1) |

H-6에서 핸들러를 둘 더 붙였다 — `HttpMessageNotReadableException`(깨진 JSON, 없는 enum 값)과
`MethodArgumentTypeMismatchException`(경로 변수 타입 불일치). 없으면 스프링 기본 응답 형태가 나가서
`ErrorResponse`와 형식이 갈린다.

## 5. 신규로 필요한 조회

Phase 1에 없어서 H-2에서 만들어야 하는 것.

| 대상 | 내용 |
|---|---|
| 목록 조회 | 검색·필터·정렬·페이징 (동적 쿼리 — **L-1 QueryDSL 전까지는 정적 조합**) |
| 태그/장르 카운트 | `facets`용 집계. 현재 사전 조회는 이름만 준다 |
| 상태별 카운트 | `facets`용 |
| batch size 설정 | 장르 컬렉션 N+1 대응 (`default_batch_fetch_size`) |

> **v0.2 진행 상황**: H-2는 **페이징·정렬만** 구현했다. 검색·필터는 L-1/L-2(Phase 6)로 미뤘다.
> 정렬 4종은 `BacklogSort` enum이 `Sort`를 만들어 넘긴다. 2차 정렬(BR-QRY-01) 위에
> **최종 tie-break로 `id desc`를 더했다** — 회차 없는 항목끼리 `lastPlayedOn`이 둘 다 null이면
> 순서가 흔들려 페이징에서 행이 중복·누락된다.
>
> `nullsLast`는 반드시 필요하다. H2는 NULL을 가장 작게, PostgreSQL은 가장 크게 본다.
> p6spy 로그에 `nulls last`가 안 보여도 정상이다 — 방언 기본값과 같으면 Hibernate가 생략한다.

> **주의**: 목록 필터가 동적인데 QueryDSL은 L-1(Phase 6)이다. Phase 2에서는 **조건 조합을 JPQL 문자열로 만들거나**, 필터 조합을 제한한 정적 쿼리 몇 개로 시작한다. 여기서 불편을 겪는 것이 L-1의 동기가 된다.
