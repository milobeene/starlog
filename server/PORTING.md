# 자바 → TS 이전 지침 (P2)

계획 전체는 `docs/v2-plan.md`. 이 문서는 **도메인 하나를 옮기는 사람**을 위한 것이다.

## 목표

자바 패키지 하나를 `server/src/domains/<도메인>/`으로 **1:1** 옮긴다.
**완료 조건은 비교 장치 diff 0** — 응답(상태·헤더·본문)과 DB 전 테이블, 데이터 폴더 파일까지.

- **동작을 바꾸지 않는다.** 자바가 정답지다. 버그처럼 보여도 그대로 옮기고 보고서에 적는다
  (예: 세이브 추출 NPE는 TS에서도 같은 자리에서 500이 나야 한다)
- 메시지 문구까지 같게. 화면이 그대로 띄운다

## 본보기

`src/domains/subscription/routes.ts` + `test/scenarios/subscription.json`. **먼저 읽을 것.**

## 소유와 규칙 (여러 명이 같은 체크아웃에서 동시에 일한다)

- **자기 도메인 폴더만 고친다.** `src/db`, `src/common`, `src/http`, `src/app.ts`, `src/main.ts`,
  다른 도메인 폴더는 **건드리지 않는다.** 필요한 게 있으면 자기 폴더에 로컬 헬퍼로 쓰고 보고서에 적는다
- **다른 도메인 모듈을 import하지 않는다** (지시받은 경우 제외). 옮기는 중인 파일을 import하면
  없는 export 때문에 **서버 기동이 깨져서 다른 사람의 비교 장치까지 멈춘다.** 남의 테이블은 schema로 직접 조회
- `src/app.ts`는 이미 모든 도메인의 `routes`를 붙여 뒀다. 자기 `routes.ts`의 `routes`에만 건다
- 타입 검사는 자기 파일만 본다: `npx tsc --noEmit -p . 2>&1 | grep 'src/domains/<도메인>'`
- 비교 장치가 남의 파일 때문에 기동 실패하면 잠시 기다렸다 다시. 남의 파일을 고치지 말 것
- **커밋하지 않는다.** git 명령은 읽기만

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
| 모양 조각 | `src/common/schemas.ts` — `zDate`·`zDecimal`·`zLong`·`zMoney`·`opt()` |
| 문자열 | `normalize`(strip+빈값→null)·`require`·`normalizeAll`·`sortKey`·`slug` (`src/common/text.ts`) |
| 금액 | `money(amount, currency)`·`scale2`·`amountJson`·`compareAmount` — **부동소수 금지** |
| 시각 | `nowKst()`·`todayKst()` — **DB `now()` 금지** (세션 시간대가 UTC면 9시간 밀린다) |
| 응답 | `ldt()`(timestamp → `"…T…"`)·`page()` (`src/common/json.ts`) |
| 주인 | `c.get("memberId")` — 자바 `@LoginMember` |

## 자바 → TS 옮길 때 함정

- **null 필드도 키를 낸다.** 응답 객체에 `undefined` 금지 — 키가 사라진다. 자바 record의 필드 순서·이름 그대로
- **enum은 이름 문자열.** `LocalDate`는 DB 문자열 그대로, `LocalDateTime`은 `ldt()`
- **BigDecimal 응답**은 `amountJson()`(숫자). 비교 장치는 숫자를 값으로 본다
- **상태코드**: 반환형 `void` → 200 빈 본문(`c.body(null, 200)`) / `noContent()` → 204 / `created` → 201 + `Location` + `{id}`
- **검증 순서**: `@Valid`(→ `violations()`)가 서비스 검증보다 먼저. 서비스 안에서도 자바 순서대로 던진다
- **소유권**: 남의 행은 "없음"(404)으로. 메시지에 id가 들어가는 형식까지 같게
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
- **N+1 걱정은 덜어도 된다** (로컬 DB). 단 목록 응답이 수백 건이면 묶어서 조회

## 비교 장치

```bash
cd server
npx tsx test/harness/run.ts test/scenarios/<도메인>.json            # 전체
npx tsx test/harness/run.ts test/scenarios/<도메인>.json --only 수정  # 이름에 '수정'이 든 단계만
```

- 실데이터 픽스처(25테이블, 게임 145개) 위에서 자바(정답지)와 TS를 동시에 띄운다. 한 번에 30~40초
- 시나리오 형식은 `test/harness/run.ts` 맨 위. `save`로 응답 값을 변수에 담아 `${변수}`로 쓴다
- 외부 자격증명은 없다 → 양쪽 다 "미설정" 경로를 탄다

### 시나리오 쓰는 법

- **엔드포인트 전부**, 그리고 **자바 코드의 `throw`마다 하나씩** (검증 실패·없음·남의 것·충돌)
- **프론트가 실제로 보내는 모양대로.** `frontend/src`에서 그 경로를 grep해서 파라미터·본문을 본다
- ⚠️ **만든 행을 다 지우면 DB 비교가 증거를 못 본다.** 쓰기 동작마다 결과가 남는 단계를 둔다
  (만들기 둘 → 하나 수정 → 다른 하나 삭제 식으로)
- 실데이터를 고치는 단계도 넣는다 (기존 id를 픽스처에서 찾아서) — 실데이터가 가장 까다롭다
- `ignore`는 최후 수단. 쓰면 `note`에 이유를

## 보고서 (끝날 때 이 형식으로)

1. 옮긴 엔드포인트 목록과 비교 결과 (단계 수 / 실패 0 / DB 같음)
2. 자바에서 발견한 버그 — **고치지 않고** 그대로 옮긴 것
3. 맞추지 못한 차이와 이유 (있으면)
4. 자기 폴더에 따로 둔 헬퍼 중 공용으로 올릴 만한 것
5. 다른 도메인이 쓸 것으로 export한 함수
