# IGDB 조사 (2026-08-22)

> RAWG → IGDB 전환 결정의 근거 문서. **문서만 읽은 게 아니라 실제 API를 호출해 확인했다.**
> 응답 지연은 전부 0.2~0.5초. 확인 안 된 항목은 §7에 따로 적었다.

## 왜 옮기는가

RAWG는 API 자체는 살아있고 데이터도 갱신된다(2026년 게임 1,889건 확인). 옮기는 이유는 **가입·로그인 폼이 깨져 있어 키를 새로 발급받을 수 없다**는 것 하나다.
`cdn.polyfill.io`(2024년 폐쇄된 도메인)를 아직도 로드하는 걸로 봐서 프론트엔드가 방치 상태고, 가진 키가 만료되면 복구 수단이 없다.
GameVault(Phalcode)도 같은 이유로 2024-05에 IGDB로 옮겼다.

---

## 1. 인증·호출 방식 (RAWG와 완전히 다름)

| | RAWG | IGDB |
|---|---|---|
| 자격증명 | API 키 1개 | Twitch **client_id + client_secret** |
| 인증 | `?key=` 쿼리 파라미터 | OAuth2 client_credentials → 액세스 토큰 |
| 토큰 수명 | — | **약 64일** (`expires_in` 5,555,362초 실측) |
| 메서드 | GET | **POST** |
| 헤더 | 없음 | `Client-ID`, `Authorization: Bearer …` |
| 본문 | 없음 | **APIcalypse** — `fields name; search "hollow"; limit 20;` |
| 호출 제한 | 없음 | **초당 4회 / 동시 8건** (초과 시 429) |
| 브라우저 직접 호출 | 가능 | **CORS 차단** — 백엔드 경유 필수 |
| 데이터 덤프 | 없음 | CSV 일일 덤프 있으나 **파트너 전용** |

토큰 발급:
```
POST https://id.twitch.tv/oauth2/token?client_id=…&client_secret=…&grant_type=client_credentials
→ { "access_token": "…", "expires_in": 5555362, "token_type": "bearer" }
```

발급 조건 — Twitch 계정 + **2FA 필수**(SMS 인증이 먼저, 인증 앱은 그다음 선택). 앱 등록 시 Client Type을 **Confidential**로 해야 시크릿이 생성된다.

**CORS 차단은 우리 설계와 이미 맞다.** 프론트가 직접 부르지 않고 백엔드가 캐시해서 내려주는 구조(J-3)를 IGDB가 강제하는 셈.

---

## 2. 우리 Game 마스터 매핑

| 우리 필드 | IGDB | 비고 |
|---|---|---|
| `externalId` | `id` | `slug`도 있음 |
| `name` | `name` | **`name_original` 없음.** IGDB는 name 하나 |
| `developers` | `involved_companies.company.name` where `developer = true` | 중첩 확장으로 한 요청에 |
| `publishers` | 〃 where `publisher = true` | 같은 배열, 불리언으로 구분 |
| `masterGenres` | `genres.name` | |
| `releasedOn` | **`first_release_date`** (Unix 초, UTC) | **이미 전 플랫폼 최솟값** — RAWG처럼 min 계산 불필요 |
| `listPrice` | ❌ 없음 | 수동 입력 유지 (RAWG와 동일) |
| `timeToBeatHours` | `game_time_to_beats.normally` (초) | **별도 엔드포인트**, `game_id`로 조인 |
| `coverImageId` (신설) | `cover.image_id` | §5-① 결정 |
| `lastSyncedAt` 비교용 | `updated_at` | RAWG `updated`와 같은 역할 |

**RAWG와 결정적으로 다른 점 — 목록/상세 구분이 없다.**
RAWG는 목록 응답에 개발사가 아예 없어서 담을 때 상세를 부르는 게 강제였다. IGDB는 APIcalypse로 필드를 요청 시점에 고르므로 검색 결과에도 개발사를 실을 수 있다.
**그래도 온디맨드 캐시(J-3)는 유지한다** — ① 검색 20건에 개발사·장르·커버까지 다 받으면 응답이 무거운데 실제로 담기는 건 1건, ② `game_time_to_beats`는 어차피 담을 때 한 번 더 필요.
설계는 그대로 두고 **필드 세트를 둘(가벼운 검색용 / 무거운 담기용)로** 나눠 표현한다.

`involved_companies`에는 `porting`·`supporting` 불리언도 있어 이식사·협력사까지 구분된다. 우리는 `developer`/`publisher`만 쓴다.

---

## 3. 데이터 품질 — 실측

| 항목 | 결과 |
|---|---|
| 전체 게임 | **373,184** |
| Main Game만 (`game_type = 0`) | **311,240** |
| `time_to_beat` 보유 | 9,112 → 전체의 **2.4%** |
| **인기 게임 30개**(`rating_count > 400`)의 `time_to_beat` 보유 | **30/30 (100%)** |
| 출시일(`first_release_date`) 없는 Main Game | 79,248 (약 25%) |
| **한국 리전 로컬라이제이션 (`region = 9`)** | **0건** |
| 등급 기관 | ESRB, PEGI, CERO, USK, **GRAC**, CLASS_IND, ACB |

**`time_to_beat` 2.4%는 겁먹을 숫자가 아니다.** 분모에 인디·모드·미니게임이 다 들어간 값이고, 실제로 백로그에 담을 만한 게임은 전수 보유했다. 실측 예:

| 게임 | `normally` | 표본 수 |
|---|---|---|
| Grand Theft Auto V | 129.6h | 68 |
| The Witcher 3 | 70.8h | 41 |
| Portal 2 | 9.0h | 33 |
| Hollow Knight | 36.9h | 29 |
| Portal | 4.1h | 45 |

표본 수(`count`)가 10~70 수준이라 정밀한 값은 아니다. **참고값으로만 쓴다**(오버라이드 대상 아님)는 기존 방침 그대로.

**한국어 게임명은 포기.** `korea` 리전(id 9)은 존재하지만 로컬라이제이션 데이터가 **0건**이다. 영문 제목만 쓴다 — RAWG 때와 같은 제약.

---

## 4. RAWG엔 없었는데 IGDB엔 있는 것

- **진짜 커버(박스아트)** — `cover.image_id`. 1200×1600(3:4 세로). RAWG는 16:9 키아트뿐이었다
  - URL은 `//images.igdb.com/igdb/image/upload/{size}/{image_id}.jpg`, 프로토콜 상대경로
  - 크기 변형 전부 동작 확인: `t_thumb`(3KB) / `t_cover_big`(20KB) / `t_720p`(62KB) / `t_1080p`(115KB)
- **지역별 출시일** — `release_dates.release_region` (europe, north_america, japan, **korea**, worldwide 등 10종) + `platform` + `status`
- **DLC 관계가 숫자가 아니라 목록** — `dlcs[]`, `expansions[]`, `parent_game`, `game_type`. RAWG는 `additions_count` 숫자뿐이었다
- **`game_type` 15종** — Main Game / DLC / Expansion / Bundle / Standalone Expansion / Mod / Episode / Season / Remake / Remaster / Expanded Game / Port / Fork / Pack·Addon / Update
- `external_games` — Steam·PS·Nintendo의 **ID**와 URL (RAWG `stores`는 링크만)
- `language_supports` — 음성/자막/인터페이스 구분
- `game_engines`, `collections`, `franchises`, `age_ratings`(GRAC 포함)

### 없는 것

| 없는 것 | 영향 |
|---|---|
| 가격 | RAWG와 동일. 정가는 수동 입력 — 스펙 그대로 |
| `playtime` 같은 "평균 플레이 시간" | 의미가 "클리어 소요 시간"으로 바뀜 (§5-⑤) |
| `tba` 단일 플래그 | `first_release_date`의 null 여부로 판별 (§6-③) |
| 한국어 제목 | 리전은 있는데 데이터가 0건 |
| 구독 포함 여부 | RAWG와 동일. `Subscription`은 전부 사용자 입력 |

---

## 5. 결정 사항

**① 커버 이미지를 쓴다.** 마스터에 `coverImageId`를 두고, 개인 업로드가 없을 때의 **폴백**으로 쓴다.
§6.9 "커버는 개인 소유" 결정은 **뒤집지 않는다** — 소유 모델은 그대로고 FR-MED-02(기본 이미지 폴백)의 기본값이 "없는 그림"에서 "IGDB 커버"로 바뀌는 것뿐이다.

**② 출시일은 지금처럼 가장 이른 날짜 하나만 쓴다.** `first_release_date`가 이미 그 값이라 RAWG 때의 min 계산이 사라진다.
지역별 출시일은 `release_dates`에 있지만 당장 쓰지 않는다. 필요해지면 열려 있다.

**③ 한국어 게임명은 기대하지 않는다.** (§3에서 0건 확인 — 판단이 맞았다)

**④ DLC 관계를 활용한다.** `game_type`·`parent_game`으로 "이건 DLC고 본편은 X"를 판별할 수 있다.
스펙의 "DLC는 본편의 추가 회차"(FR-PT-06)와 Phase 7 임포트 매칭에 쓸 재료. **구체적 활용은 J-7 범위 밖 — 재료가 있다는 것만 기록.**

**⑤ `averagePlaytimeHours` → `timeToBeatHours` 로 개명.** 의미가 "평균 플레이 시간"에서 **"곁가지 좀 섞어 클리어까지 걸리는 평균 시간"** 으로 바뀐다.
백로그 앱에는 오히려 이쪽이 맞는 지표다. `spec-v1.5.md` §6.2 / `entity-design` / `api-design` 세 곳을 같이 고친다.

**⑥ 검색에서 에디션·모드·업데이트를 제외한다.** (§6-④)

**⑦ 라이선스는 신경 쓰지 않는다.** 개인 사용이고, IGDB 문서에 RAWG 같은 "모든 페이지 출처 표기 + 활성 링크" 명문 조항이 없다(Twitch Developer Services Agreement를 따름).
**RAWG 출처 표기는 제거 대상** — 대시보드 푸터에 남아 있다. 상업적 전환 시 `partner@igdb.com`.

---

## 6. 구현 시 주의 (J-7 체크리스트)

**① 초당 4회 / 동시 8건 제한**
지금 사용 패턴(검색 1회, 담기 1회)은 개인용이라 안 걸린다. **Phase 7 임포트에서 파일 수십~수백 개를 매칭할 때는 반드시 걸린다.**
지금은 클라이언트에 호출 간 최소 간격만 두고, 본격적인 스로틀링·백오프는 M단계에서 한다.

**② 토큰 관리가 새로 필요하다**
64일짜리 토큰을 매 요청마다 새로 받으면 안 된다. 캐시해두고 만료 전에 갱신하되, **401을 받으면 강제 재발급 후 1회 재시도**하는 경로도 있어야 한다(서버 재시작·시크릿 회전 대응).

**③ 출시 미정(TBD) 판별 — RAWG보다 오히려 단순하다**
`date_format` 테이블에 `7 = TBD`가 있고 `release_dates.human`이 `"TBD"`로 온다. 하지만 **게임 단위로는 `first_release_date`의 null 여부만 보면 된다.**
`game_status`는 신뢰할 수 없다 — 출시일 없는 인기 게임 5개 중 1개(`Zaos`)는 `game_status` 자체가 비어 있었다.
→ **규칙: `first_release_date == null` → `releasedOn = null`.** 끝.

**④ 검색 필터 — `version_parent = null`만으로는 부족하다**
`search "hollow knight"`의 1위가 **모드**(`game_type = 5`, `parent_game = 14593`)였다. 모드는 `version_parent`가 아니라 `parent_game`을 갖기 때문에 문서 권장 패턴만으로는 안 걸러진다.
실측으로 확인한 조합:
```
search "hollow knight";
where version_parent = null & game_type = (0,3,4,8,9,10,11);
```
→ 진짜 Hollow Knight가 1위로 올라온다. (허용: Main Game·Bundle·Standalone Expansion·Remake·Remaster·Expanded·Port / 제외: DLC·Expansion·Mod·Episode·Season·Fork·Pack·Update)

**⑤ 시간 단위 변환**
- `first_release_date` / `updated_at`: **Unix 초** → `LocalDate` 변환 시 UTC 기준
- `game_time_to_beats.normally`: **초** → 시간으로 나눠 저장

**⑥ 호출은 `multiquery`로 한 번에**
`games`와 `game_time_to_beats`는 다른 엔드포인트지만 `POST /v4/multiquery`로 묶을 수 있다(최대 10개 쿼리). 담기 시 호출 횟수는 **1회 유지**.

**⑦ `GameSource` enum에서 `RAWG` 제거, `IGDB` 추가**
실데이터가 없는 지금이 가장 싸다. 남겨두면 영원히 안 쓰는 값이 check 제약에 남는다.

**⑧ 포트 이름을 중립으로**
`RawgClient` → `GameCatalogClient` 등. 이번에 배운 게 "제공자는 또 바뀐다"인데 포트 이름에 제공자가 박혀 있으면 다음에 또 거짓말이 된다. `AuthMailSender`가 SMTP를 이름에 안 넣은 것과 같은 이유.

---

## 7. 확인 안 된 것

- **Twitch Developer Services Agreement 원문** — 읽지 않았다. 개인 사용이라 §5-⑦로 넘어감
- **429 응답의 실제 형태** — 제한을 일부러 넘겨보지 않았다
- **토큰 만료 시 실제 동작** — 64일 뒤에나 확인 가능. 401 재시도 경로는 테스트로 대신한다
- **검색 정확도 전반** — Hollow Knight 한 건만 봤다. 한글 검색어·부분 일치는 미확인
