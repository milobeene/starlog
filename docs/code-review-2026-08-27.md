# 코드 리뷰 2026-08-27 — v0.1 이후 코드

> `code-review-2026-08-26.md` 이후에 쓴 코드를 리뷰어 6명이 **병렬로** 봤다.
> 슬라이스: 쿼터·타임존 / 완전삭제 / 세션 스토어 / 팝업 배치 / WebGL·애니메이션 / 통계·정렬.
>
> **모든 발견을 코드로 직접 검증했다.** 아래 "고침"은 재현하거나 증명한 것만이다.

## 요약

| | |
|---|---|
| 고침 | **21건** |
| 안 고침(근거와 함께 남김) | 5건 |
| 오탐 | 2건 |
| 새 테스트 | 5개 (재발 방지) |

---

## 🔴 심각 — 운영에서 조용히 깨져 있던 것 셋

### 1. 회원 물리 삭제가 매일 실패하고 있었다

`MemberPurgeService.DELETE_ORDER`에 **`UsageQuota`가 없었다.** V3가 `fk_usage_quota_member`를
걸어놨는데 `delete from Member`가 거기 걸린다.

**왜 아무도 몰랐나** — 두 겹으로 숨어 있었다.
1. `UsageQuota`는 회원을 `@ManyToOne`이 아니라 `@EmbeddedId` 안의 `Long`으로 든다.
   그래서 **`ddl-auto: create`가 만드는 테스트 스키마에는 그 FK가 아예 없다.**
   배포 스키마(Flyway V3)에만 실재한다
2. `purgeExpired`가 예외를 삼키고 로그만 남긴다 — 실패가 화면에 안 드러난다

결과: 테스트 440여 개가 전부 초록인 채로 **유예 만료 회원이 영영 안 지워지고**,
커버 키를 못 모아 R2에 탈퇴 회원 이미지가 영구 잔존했다.

→ 삭제 목록에 추가. 그리고 **`MemberPurgeSchemaTest`를 새로 만들었다** —
`spring.flyway.enabled=true` + `ddl-auto=validate`로 **배포 스키마 위에서** 돈다.
이런 부류를 다시 놓치지 않으려면 이 테스트가 있어야 한다.

### 2. 쿼터 경합 방어가 한 번도 안 돌았다

`DbQuotaGuard.consume`의 `catch (DataIntegrityViolationException)`이 **죽은 코드**였다.

`UsageQuota`는 `@EmbeddedId`(할당 식별자)라 Hibernate가 id를 받으려고 DB를 칠 필요가 없다.
그래서 `persist()`가 액션 큐에만 넣고 **INSERT를 flush까지 미룬다.** `consume()` 안에는
persist 뒤에 flush를 부르는 것이 없으니 실제 INSERT는 **커밋 시점** — try 블록 밖이다.

**증명해서 못 박았다** (`QuotaRaceProofTest`). 첫 시도는 오염됐었다 —
네이티브 쿼리가 스스로 flush를 유발해서 "persist가 즉시 INSERT했다"는 잘못된 결론이 나왔다.
`FlushMode.MANUAL`로 막고 다시 재서 확정했다.

→ `UsageQuotaInitializer`(별도 빈 + `REQUIRES_NEW`)로 분리. **잡는 위치가 핵심이다** —
`@Transactional` 메서드 *안에서* 잡으면 스프링이 정상 반환으로 보고 커밋을 시도하는데
세션이 이미 오염돼 `UnexpectedRollbackException`이 난다(고치는 중에 실제로 밟았다).
잡는 건 트랜잭션 경계 **밖**, 즉 호출부여야 한다.

### 3. WebGL 컨텍스트가 새서 전역 배경이 죽는다

`FluidCanvas`의 cleanup이 `cancelAnimationFrame`만 했다. 컨텍스트·프로그램·버퍼를 안 놨다.

리뷰어가 **실측했다** — 설정 → 프로필 다이얼로그를 여닫으면 미리보기가 매번 새 컨텍스트를
만들고, **16회째에 크롬이 가장 오래된 것을 강제로 잃게 한다.** 가장 오래된 건 루트 레이아웃의
전역 배경이다. 게다가 `webglcontextlost`에서 `preventDefault()`를 안 하면 복구 이벤트가
아예 안 오고, 루트 레이아웃은 리마운트가 없어 **새로고침 전까지 영영 안 돌아온다.**

→ 자원 해제 + `loseContext()` + 손실/복구 리스너. `buildProgram`의 셰이더 누수도 함께.

---

## 🟠 그 밖에 고친 것

| | 무엇이 문제였나 |
|---|---|
| `local-app` 프로필로 **기동조차 안 됐다** | `AdminController`가 `@Profile("!local-app")`인 `SystemStatusService`를 물고 있었다. `NoOpQuotaGuard`를 만든 이유가 그 한 줄에서 깨졌다 → 별도 컨트롤러로 분리 + `LocalAppProfileTest` 신설 |
| **Esc 한 번이 다이얼로그까지 닫아 편집 내용이 날아갔다** | DateField·Combobox·Modal이 전부 같은 `document`에 리스너를 단다 → `stopImmediatePropagation` |
| 세션이 옛 답에 덮였다 | `inFlight = null`은 요청을 취소하지 않는다. 로그인 성공을 뒤늦은 401이 덮어썼다 → 세대 번호 가드 |
| 네트워크 실패를 **비로그인으로 확정**했다 | 잠든 서버를 깨울 때 502를 받으면 guest로 굳고, 재검증 경로가 없어 앱에 못 들어갔다 → 401/403만 확정, 나머지는 "모름" |
| 재검증이 **아예 안 돌았다** | "구독자 0→1"에 걸었는데 `FluidBackground`가 루트 레이아웃에 상주해 0이 되는 순간이 없다 → 탭 포커스로 교체 |
| 저장할 때마다 **스크롤이 맨 위로 튀었다** | 전역 무효화가 화면을 통째로 스켈레톤으로 되돌렸다 → 소비자 3곳에서 `loading ||` 제거 |
| 삭제 후 사이드바에 유령이 남았다 | 상세의 삭제만 `invalidateQueries()`가 빠져 있었다 |
| 지출 툴팁의 펼치기를 **못 눌렀다** | `onMouseLeave`가 svg에 걸려 있어 포인터가 버튼에 닿기 전에 사라졌다 |
| 팝업이 화면 밖으로 나갔다 | `placeBelow`에 세로 클램프가 없었다. Dropdown은 첫 열기에 실측 자체가 안 됐다(폴백 div에 ref 없음) |
| 팝업이 스크롤을 안 따라왔다 | DateField·Dropdown에 `scroll`/`resize` 재측정이 없었다 |
| 재시도도 401이면 **500이 났다** | 어드바이스에 그 예외 핸들러가 없다. 바로 옆 테스트가 "스프링 예외가 안 샌다"를 못 박고 있었는데 이 경로만 어겼다 → 502로 접음 |
| 빈 검색어가 쿼터를 먹었다 | IGDB 호출은 0회인데 `?q=`를 200번 때리면 하루치가 탄다 |
| ApplicationRunner 순서가 **파일시스템 열거 순서**였다 | `@Order` 명시 |
| 파셋 정렬이 동점을 남겼다 | concat을 붙인 바로 그 상황(같은 라벨, 다른 플랫폼)에서 순서가 흔들렸다 |
| 미래 시작 구독이 두 통계에서 갈렸다 | `/spending`은 LocalDate, `/spending/monthly`는 YearMonth로 경계를 봤다 |
| 우클릭에도 심볼이 돌았다 | `event.button` 미검사. 멀티터치에서 남의 손가락에도 반응 |
| 그 외 | 0원 취득이 이름만 얹힘 · `addMonths` 음수 모듈로 · `monthOf` 월 범위 · `input[type=color]` 대소문자 · `useApi`의 옛 에러 잔류 · `logout()` unhandled rejection · 미리보기 실패 시 스켈레톤에 갇힘 · `.menu-panel`이 `p-3`를 이김 · 셰이더 주석 드리프트 |

---

## 안 고친 것 — 근거와 함께

| 항목 | 판단 |
|---|---|
| `CATALOG_BUSY` 429가 `GAME_ADD` 쿼터를 먹는다 | IGDB 호출 0회인데 쿼터가 준다. 다만 **동시 7건 이상**이라야 도달하고 우리는 1인이다. 세는 대상이 "부르게 만든 시도"라는 규약과도 아슬하게 맞는다 |
| `forceRefresh()`가 남의 새 토큰까지 지운다 | 401이 동시에 여러 건 날 때만. 시크릿 회전 직후뿐이고 피해는 토큰 발급 몇 회 |
| `yearlyAverages`를 아무도 안 쓴다 | 화면에 붙일 때 라벨과 함께 정리. 지금 지우면 다시 만들 것 |
| `items`가 통화를 구분하지 않는다 | 고치려면 `Map<currency, List<String>>`으로 DTO·프론트·계약검사가 같이 움직인다. 통화 혼합이 실제로 드물다 |
| `NAME` 정렬 콜레이션이 dev/prod에서 갈릴 수 있다 | glibc PG와 musl/H2의 정렬이 다르다. 페이징은 안 깨진다(한 DB 안에서는 결정적). Neon의 실제 콜레이션을 확인해야 확정된다 — **v1.0에서 볼 것** |

## 오탐 둘

- `LibrarySidebar`의 `names` 의존성 경고 — 이미 `names.data`가 deps에 있고, 잡힌 건
  타입 질의(`typeof names.data`)라 런타임 참조가 아니다
- `session.ts`의 `window.location.href` 경고 — **의도된 것**이다. 모듈 스토어를 초기화하려면
  전체 리로드여야 하고, `router.push`로 바꾸면 로그아웃이 안 먹는다

---

## 남은 테스트 공백

- `BacklogPurgeTest`에 **커버가 붙은 항목** 케이스가 없다 (`AfterCommit` 경로가 미검증)
- 실 PostgreSQL 테스트가 `LAST_PLAYED` 정렬과 `countByPlatformAccount`를 안 태운다 —
  둘 다 이번에 바뀐 쿼리다
