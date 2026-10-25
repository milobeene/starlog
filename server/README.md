# STARLOG 서버 (v2)

일렉트론 안에서 `utilityProcess`로 도는 HTTP 서버. 화면(`frontend/`)이 부르는 `/api/*` 90개와 정적 화면 서빙.
2026-10-24 자바(Spring Boot)에서 1:1로 옮겼다 — 계획·결정·자바 버그 목록은 `docs/v2-plan.md`.

```bash
npm run dev            # 8080 개발 서버 (server/.dev/db). --fixture면 실데이터 복사본
npm run typecheck      # 마이그레이션 코드 생성 + tsc
npm test               # 단위 (vitest)
npm run test:golden    # 녹화본 회귀 — 시나리오 전부
npm run bundle         # → ../desktop/server/main.mjs
```

## 기동 순서 (`src/main.ts`)

잠금(세이브파일 옆 `.lock`) → DB 열기 + 진단(`src/diagnose.ts`, 실패 시 `STARLOG_DIAGNOSTIC: <코드>`) →
마이그레이션(`migrations/V*.sql`, `flyway_schema_history` 이어 쓰기) → 프로필(빈 DB면 한 행 + 기본 선택지) → 미디어 폴더 →
기동 정리(30일 지난 API 기록 · 플레이타임 합계 다시 맞춤) → 리슨 → `STARLOG_READY port=<n>`. 종료는 SIGTERM 또는 부모의 `{type: "shutdown"}` 메시지 — PGlite를 닫고 잠금을 푼다.

**문지기 (`src/http/guard.ts`·`cors.ts`)** — 로컬 포트는 같은 맥의 아무 탭·프로세스나 두드릴 수 있다 (보안 점검 2026-10-25).
순서: 보안 머리글(`nosniff`·`no-referrer`) → **Host**(`127.0.0.1:<포트>`·`localhost:<포트>`만, 정적 화면까지 — DNS 리바인딩) →
**CORS**(고정 목록: `app://starlog`·`http://127.0.0.1:<포트>`, dev면 `http://localhost:3000`·`http://127.0.0.1:3000`. 남은 403 —
요청의 Host로 "같은 출처"를 끌어내지 않는다) → **토큰** → **`Sec-Fetch-Site: cross-site`**(토큰이 맞으면 통과 — 창 `app://`→127.0.0.1은 늘 cross-site다) →
**본문 형식**(쓰기 요청은 `application/json`만, 멀티파트는 업로드 두 자리만, 아니면 415) → **본문 크기**(업로드 260MB · `/api/me/import|replace` 50MB · 나머지 5MB).
⚠️ CORS를 빼면 앱이 **배경만 남은 검은 화면**이 된다.

| | 운영 (일렉트론) | dev·test (`npm run dev`·골든 일부) |
|---|---|---|
| `STARLOG_API_TOKEN` | **필수** — 없으면 `STARLOG_DIAGNOSTIC: API_TOKEN_MISSING` | **있으면 안 됨** — `DEV_PROFILE_WITH_TOKEN` |
| 토큰 | `X-Starlog-Token` 머리글, GET·HEAD만 `?t=`(`<img>`·`<video>`용). 아니면 401 `UNAUTHORIZED` | 없음 |
| 허용 출처 | `app://starlog`, 자기 자신 | + 개발 화면 :3000 |
| cross-site | 토큰이 맞으면 통과 | 403 `CROSS_SITE` |

골든 장치는 운영 프로필 시나리오마다 토큰을 새로 만들어 넣는다. 단계에 `"auth": "none" | "wrong" | "query"`로 바꿔 볼 수 있다.
시크릿(IGDB·번역 키)은 `GET /api/system/settings`에서 **가려서**(`••••` + 끝 4자리) 나가고, 원문은 `POST /api/system/settings/reveal`.
가린 값을 그대로 저장·시험하면 저장된 원문을 쓴다.

설정은 전부 환경변수 (`src/config.ts`): `STARLOG_DB_DIR`(로컬) 또는 `STARLOG_DB_URL`·`_USER`·`_PASSWORD`·`_SCHEMA`(클라우드),
`STARLOG_PORT`, `STARLOG_DATA_ROOT`, `STARLOG_STATIC_DIR`, `STARLOG_API_TOKEN`(운영 필수), `STARLOG_PROFILE`(dev·test면 토큰 없이 돌고 시험 장치를 연다),
`APP_IGDB_*`, `APP_STORAGE_*`, `STARLOG_MEDIA_USE_STORAGE_*`, `TRANSLATE_API_KEY`,
`STARLOG_THUMBNAILER=copy`(dev·test 전용 — 일렉트론 없이 썸네일 흐름을 시험할 때 원본을 복사).

클라우드 DB는 **기본이 TLS + 인증서 검증**이다 (`db/client.ts` `connectionFields`) — 평문은 주소에 `sslmode=disable`을 적었을 때만.

**스크린샷 썸네일 (`src/common/storage/thumbs.ts`)** — `<게임 폴더>/.thumbs/<원본>.jpg`. 만드는 건 일렉트론 메인이다
(`parentPort`로 `thumbnail` 요청 → `thumbnail:result`, 짝은 `desktop/media.js`). 일렉트론이 없으면 `thumbUrl`이 null.
⚠️ `.thumbs`는 스크린샷이 아니다 — 목록·번호·용량·이름으로 읽기/지우기에서 빼야 한다. 새 경로를 만들면 거기서도 빼는지 볼 것

## 쓰는 것

| | |
|---|---|
| DB | `db()` → Drizzle. 쓰기는 `db().transaction(async (tx) => …)`. 헬퍼는 `Db` 타입을 받으면 tx도 받는다 |
| 스키마 | `src/db/schema.ts` (타입용, 원본은 `migrations/*.sql`). 시각·날짜는 문자열, numeric은 문자열 |
| 날 SQL | `rows<T>(d, sql\`…\`)` / `one<T>()` (`src/db/raw.ts`) — `distinct on`·윈도 함수 등 |
| 오류 | `src/common/errors.ts` — `NotFound`·`InvalidInput`·`Conflict`·`Revivable`·`TooManyRequests`·`ExternalApi`·`FileIo`… 제약 위반(23xxx)은 전역 핸들러가 409로 바꾼다 |
| 파라미터 | `pathId(c, "entryId")`, `query(c).long("tagId")` / `.int("page", 0)` / `.enumList(...)` / `.date(...)` — 스프링 바인딩 규칙 |
| 본문 | `readBody(c, zodSchema)` (읽기 실패 → "요청 본문을 읽을 수 없습니다") → `violations()…throwIfAny()` (Bean Validation) |
| 기본 문구 | `DEFAULT_MSG` — `@NotBlank` 등에 메시지가 없을 때 (하이버네이트 밸리데이터 한국어) |
| 모양 조각 | `src/common/schemas.ts` — `zText`(String 필드는 이걸로 — 숫자·불리언도 받는다)·`zDate`·`zDecimal`·`zLong`·`zMoney`·`opt()` |
| 문자열 | `normalize`(strip+빈값→null)·`require`·`normalizeAll`·`sortKey`·`slug` (`src/common/text.ts`) |
| 금액 | `money(amount, currency)`·`scale2`·`amountJson`·`compareAmount` — **부동소수 금지** |
| 시각 | `nowKst()`·`todayKst()` — **DB `now()` 금지** (세션 시간대가 UTC면 9시간 밀린다) |
| 응답 | `ldt()`(timestamp → `"…T…"`)·`page()` (`src/common/json.ts`) |
| 플레이타임 | `domains/backlog/playtime.ts` — **기록(`play_record`) + 끝난 homeops 일정(`homeops_play_log`)의 합이 원본**, `backlog_entry.play_time_hours`는 캐시. 기록을 바꾸면 `syncPlayTime`, 기동 때 `syncAllPlayTimes`. 계산은 0.1분 정수(BigInt). 목록 `GET …/play-records?page&size`(기본 10)는 두 표를 **한 SQL `union all`로 합쳐** 쪽으로 자른다 — 순서 날짜·시각·출처·번호(번호가 두 표에서 겹쳐서 출처까지 있어야 쪽이 안 흔들린다), 응답은 `page()` 모양 |
| 프로필 | `findProfile(d)` (`domains/member/profile.ts`) — `member` 테이블의 **한 행**. 주인·소유권 개념이 없다 (V14) |

## 함정 (이전하면서 실측으로 찾은 것)

자바(Jackson·하이버네이트·스프링)와 같은 동작을 내려고 맞춘 것들이다. 고칠 때 깨지 않게.

- **null 필드도 키를 낸다.** 응답 객체에 `undefined` 금지 — 키가 사라진다. 자바 record의 필드 순서·이름 그대로
- **enum은 이름 문자열.** `LocalDate`는 DB 문자열 그대로, `LocalDateTime`은 `ldt()`
- **BigDecimal 응답**은 `amountJson()`(숫자). 비교 장치는 숫자를 값으로 본다
- **상태코드**: 반환형 `void` → 200 빈 본문(`c.body(null, 200)`) / `noContent()` → 204 / `created` → 201 + `Location` + `{id}`
- **검증 순서**: `@Valid`(→ `violations()`)가 서비스 검증보다 먼저. 서비스 안에서도 자바 순서대로 던진다
- **없는 행**은 404 — 메시지에 id가 들어가는 형식까지 같게. (V14 전에는 "남의 행"도 같은 404였다 — 주인이 하나라 이제 그런 행이 없다)
- **변경 감지**: 하이버네이트는 **값이 실제로 바뀐 엔티티만** UPDATE하고 그때만 `updatedAt`을 바꾼다.
  같은 값으로 수정하면 `updated_at`이 그대로다 → 가능하면 맞춘다 (비교 장치는 `updated_at`만 다른 건 경고로 센다)
- **`@LastModifiedDate`/`@CreatedDate`**: insert 때 `createdAt`·`updatedAt` 둘 다 `nowKst()`
- **벌크 쿼리**(`@Modifying @Query`)는 자바에서도 `updatedAt`을 SET 절에 직접 쓴다 — 쓴 그대로
- **cascade·orphanRemoval**: 자바 엔티티의 연관관계 매핑을 보고, 지울 때 같이 지워지는 행·순서를 맞춘다
- **정렬**: 같은 DB라 SQL이 같으면 결과가 같다. JPQL·QueryDSL의 `order by`를 그대로 옮긴다
  (동점일 때 2차 정렬이 없으면 자바도 순서가 비결정적이다 — 그런 데서 diff가 나면 보고서에)
- **라우트 등록 순서**: 고정 경로(`/api/backlog/all`)를 변수 경로(`/api/backlog/:id`)보다 **먼저** 건다
- **외부 호출(IGDB·번역·S3)은 트랜잭션 밖에서.** PGlite는 트랜잭션 동안 다른 요청을 다 세운다
- **Jackson은 모르는 필드를 무시한다** → Zod `z.object`(기본이 strip). `.strict()` 쓰지 말 것
- **Jackson은 String 필드에 숫자·불리언을 받는다** → `z.string()` 말고 `zText`
- **`@NotBlank`는 전각 공백(U+3000)도 공백이다** → `violations().notBlank`가 그렇게 본다 (2026-10-24 고침)
- **위반 메시지가 둘 이상이면 자바 순서가 실행마다 바뀐다** → 시나리오는 위반 하나씩
- **`play_time_hours`에 직접 쓰지 않는다** (v2 S4) — 기록을 넣고 `syncPlayTime`. 항목을 지우는 경로(완전 삭제·마스터 삭제·덮어쓰기)는
  `play_record`를 먼저 지운다. `homeops_play_log`는 **STARLOG가 쓰지 않는 표**다 — 항목이 지워질 때 FK cascade로만 사라진다
- **정수 칸의 `sum()`은 int8이라 숫자로 온다** — 소수 계산에 넘길 거면 `::text`로 받는다
- **N+1 걱정은 덜어도 된다** (로컬 DB). 단 목록 응답이 수백 건이면 묶어서 조회

## 회귀 테스트 — 시나리오와 녹화본

```bash
npx tsx test/harness/run.ts test/scenarios/<도메인>.json            # 녹화본과 대조
npx tsx test/harness/run.ts test/scenarios/<도메인>.json --only 수정  # 이름에 '수정'이 든 단계만
npx tsx test/harness/run.ts test/scenarios/<도메인>.json --update   # 동작을 일부러 바꾼 뒤 다시 녹화
```

- 시나리오(`test/scenarios/`)는 요청 목록이다. 형식은 `test/harness/run.ts` 맨 위
- 녹화본(`test/golden/`)은 **자바와 diff 0으로 확인된 결과**를 녹화해 둔 것 — 응답 + 픽스처 대비 바뀐 행 + 파일 트리
- 픽스처는 `server/.dev/`에 실데이터 백업(`docs/backup-*-neon`)에서 자동으로 만든다
- ⚠️ 녹화본·픽스처는 실데이터라 **gitignore** — 이 테스트는 백업이 있는 맥에서만 돈다
- 빈 세이브에서 시작하려면 `"fixture": "fresh"` (프로필 + 기본 카탈로그만)
- API로 못 만드는 행(homeops 일정)은 시나리오의 `"sql": [...]` — 픽스처 복사본을 최신 버전까지 올린 뒤, 시작 상태를 뜨기 전에 넣는다
- 정규화: 실행 중 생긴 시각은 `<NOW>`(지금 **이후** 시각 전부 — 먼 미래 날짜도), 서버가 채운 오늘 날짜는 `<TODAY>`
- 실데이터 픽스처는 **백업 시점의 버전까지** SQL을 돌려 행을 넣고, 그 뒤 버전(V14…)은 앱 러너로 올린다 —
  새 마이그레이션이 픽스처를 만들 때마다 실데이터 위에서 시험된다. 마이그레이션을 바꾸면 `.dev/fixture*`를 지우고 다시 돌릴 것

### 시나리오 쓰는 법

- **엔드포인트 전부**, 그리고 **코드의 `throw`마다 하나씩** (검증 실패·없음·충돌)
- **프론트가 실제로 보내는 모양대로.** `frontend/src`에서 그 경로를 grep해서 파라미터·본문을 본다
- ⚠️ **만든 행을 다 지우면 DB 비교가 증거를 못 본다.** 쓰기 동작마다 결과가 남는 단계를 둔다
  (만들기 둘 → 하나 수정 → 다른 하나 삭제 식으로)
- 실데이터를 고치는 단계도 넣는다 (기존 id를 픽스처에서 찾아서) — 실데이터가 가장 까다롭다
- ⚠️ **시나리오에 실데이터(게임명·메모·실명)를 적지 않는다** — 시나리오는 커밋되고 저장소가 공개다
- `ignore`는 최후 수단. 쓰면 `note`에 이유를
