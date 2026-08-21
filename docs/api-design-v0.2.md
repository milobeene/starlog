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

#### 쿼리 예산 — 4방 (v0.2에서 측정 후 정정)

```
1방  항목 + game + lastPlaythrough + device + emulator   전부 ~ToOne → join fetch (페이징 유지)
1방  개인 장르 연결 (backlog_entry_genre, batch size)
1방  장르 본체     (genre, batch size)          ← v0.1이 빠뜨린 자리
1방  마스터 장르   (game_master_genre, batch size)
```

**v0.1은 3방으로 잡았는데 실제로는 4방이다.** `BacklogEntryGenre.genre`가 LAZY `@ManyToOne`이라
조인 테이블에서 장르 본체로 가는 hop이 한 단계 더 있다. batch size가 없으면 이게 항목 수만큼 터진다
(3항목에 8방을 실제로 관측했다).

페이징을 걸면 count 쿼리가 붙어 5방. 총 개수가 페이지 크기보다 작으면 스프링이 count를 생략한다.
**중요한 건 항목 수가 늘어도 이 숫자가 안 늘어난다는 것이다.**

`lastPlaythrough` 비정규화(§7.2)가 없으면 이 자리가 항목 수만큼의 쿼리가 된다. 컬렉션 fetch join은 페이징을 깨므로(§6.8) 우회할 수 없다.

> **커버 이미지는 아직 응답에서 항상 `null`이다.** `CoverImage`가 FK를 가진 주인이라 역참조가 없고,
> 무엇보다 Phase 5(K) 전까지 행이 생길 경로가 없다. 죽은 조인을 미리 붙이지 않았다.

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

### 1.3 백로그 상세 (화면 2)

```
GET /api/backlog/{entryId}
```

**표시값과 마스터 원본값을 둘 다 준다.** 편집 화면이 "내가 뭘 덮어썼는지"를 보여줘야 하고, 정보가 많은 편이 프론트에서 자르기 쉽다.

```jsonc
{
  "entryId": 12,
  "status": "PLAYING",
  "coverUrl": "...",

  "resolved": {                              // 화면에 뿌리는 값
    "name": "링 피트 어드벤처",
    "developers": ["Nintendo"],
    "publishers": ["Nintendo"],
    "releasedOn": "2019-10-18",
    "listPrice": { "amount": 89800, "currency": "KRW" },
    "genres": ["피트니스", "기능성"]
  },
  "master": {                                // 편집 화면의 "마스터: ~" 힌트
    "gameId": 5,
    "name": "Ring Fit Adventure",
    "developers": ["Nintendo"],
    "publishers": ["Nintendo"],
    "releasedOn": "2019-10-18",
    "listPrice": null,
    "genres": ["Sports"],
    "source": "MANUAL"
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

### 2.4 마스터 게임 검색 (v0.2 신설)

```
GET /api/games?q=knight        로컬 마스터만, 이름 부분 일치, 상위 20건
```

**v0.1에 구멍이 있었다** — `POST /api/backlog`가 `gameId`를 받는데 그 id를 얻을 경로가 없었다.
RAWG 검색은 Phase 4(J-2)다. 그때까지 이 엔드포인트가 그 자리를 메운다.
회원 식별이 없는 유일한 조회다 (마스터는 공용 데이터).

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
```

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

### 알려진 허용 리스크 — 참조 id의 소유권 미검사 (v0.2 리뷰에서 발견, 의도적 보류)

회차·취득의 `platformAccountId`는 소유권·소프트 삭제 검사 없이 연결된다
(`PlaythroughService`·`AcquisitionService`의 참조 해석이 bare `findById`).
**1인 사용 프로그램이라 참작하고 넘어간다.** 다중 사용자로 전환하거나 Phase 3 인증을
붙일 때는 구독 연결(`findOwned`)과 같은 방식으로 막아야 한다.

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
