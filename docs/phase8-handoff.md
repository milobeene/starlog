# Phase 8 인수인계 (2026-08-25)

프론트엔드가 **전 화면 구현 완료** 상태다. 백엔드도 Phase 8에서 여러 번 손댔다.

---

## 0-0. Phase 9 야간 작업 완료분 (2026-08-26)

1. **스키마 베이스라인 재작성** — V1~V3 청산, 손설계 단일 V1 (`db-baseline-v1.md`)
2. **STARLOG 이름 못박기** — 패키지 `com.milobeene.starlog` 전면 치환
3. **Neon 실검증** — 리셋 → 새 V1 → API 왕복. PG 전용 버그 2건 발견·수정
4. **멀티에이전트 코드 리뷰 62 에이전트** — 확정 21건 중 HIGH 5건 포함 전부 조치 (`code-review-2026-08-26.md`)
5. **테스트 409 → 416** — 마이그레이션 안전망, Testcontainers 부분 도입, 커밋 시점 검증 지원

**커밋은 안 했다** — 커밋 메시지는 아래 §커밋 참고.

---

## 0. 남은 할 일

1. ~~백엔드 스펙 ↔ 프론트 전수 검증~~ — **완료. 결과는 §0-4** (남은 미구현 3건은 아래)
2. ~~Neon 실물 DB 검증~~ — **완료.** 스키마 리셋 → 새 V1 적용 → API 왕복 검증까지 (`docs/db-baseline-v1.md`)
3. **옵시디언 임포트 결과 수정** (아래 ③)
4. ~~서비스명 STARLOG 못박기~~ — **완료.** 패키지 `com.milobeene.starlog`, gradle·문서 전부.
   **남은 것 둘**: 저장소 폴더명(`mv game-backlog starlog` — 세션 작업 디렉터리라 미뤘다),
   구글 OAuth 동의 화면 App name (콘솔에서 직접)
5. ~~인증 메일 발송~~ — 구글 로그인 전용으로 전환 (§0-3)
6. **감사에서 남긴 미구현 3건** — FR-STAT-02(완료 통계), FR-STAT-04(지출 2축),
   FR-BL-09(변경 이력). 앞 둘은 백엔드 API가 놀고 있고 "화면 어디에 넣을지"가 미정이라 보류했다
7. Phase 9 배포 · Phase 10 (§6)

---

## 0-1. 방금 끝난 것 — 선택지 회원 소유 전환 (제일 큰 변경)

플랫폼·기기·에뮬레이터가 **전역 마스터**였고 입력 방식은 **enum 4개**였다. 넷 다 회원 소유로 내렸다.

**왜** — 보유 기기를 추가해도 회차 선택지에 안 떴다. 회차는 `Device` 마스터를,
보유 기기는 `MemberDevice`를 가리켜 둘이 따로 놀았기 때문이다. 같은 기종 두 대도 구분 못 했다.

| 항목 | 지금 |
|---|---|
| 플랫폼 | 이름만. 회원 소유 |
| 플랫폼 계정 | 플랫폼 참조 + 라벨 (그대로) |
| 기기 | **마스터 폐지.** 유형("Windows PC") + 라벨("메인 윈도우") + 마크다운 메모 |
| 에뮬레이터 | 이름 + 마크다운 메모 |
| 입력 방식 | **enum → 테이블.** 이름만 |

- 다섯 종 전부 `MemberOwnedEntity`(member + deletedAt) 상속, **소프트 삭제**
- 이름을 바꾸면 FK를 타고 과거 회차·취득에 전부 반영된다
- 지웠던 이름을 다시 추가하면 **조용히 되살아난다.** 계정만 예외로 409 + 확인(취득 이력까지 물어서)
- 플랫폼을 지우면 딸린 계정도 함께 닫힌다
- 가입 시 `DefaultCatalogSeeder`가 기본 플랫폼 6종 + 입력 방식 4종을 복사한다. 기기·에뮬은 안 넣는다
- 관리자 마스터 CRUD(FR-ADM-04)·`MasterDataService`·`MemberDevice` 삭제. 스펙 v1.8로 개정

**⚠️ 이 이행 마이그레이션(V2)은 이후 청산됐다.** 데이터가 소모품이 된 시점에
V1~V3를 단일 베이스라인 `V1__init.sql` 하나로 다시 썼다 — `docs/db-baseline-v1.md` 참고.
Neon도 리셋 후 새 V1로 재적용을 마쳤다.

---

## 0-3. 메일 발송 불가 → 구글 로그인 전용 전환 (스펙 v1.9)

**도메인이 없어서 인증 메일을 못 보낸다.** Resend는 도메인 인증 전까지 계정 소유자에게만 보내주고,
유일한 우회로였던 SMTP는 Render 무료 플랜이 2025-09부터 아웃바운드(25/465/587)를 막았다.
메일이 안 가면 계정이 미인증으로 남아 **로그인이 영영 403**이다(I-4).

→ **메일이 필요 없는 경로만 남겼다.** 구글은 구글이 이메일 소유를 확인해준다.

| 잠근 것 | 어디 |
|---|---|
| 이메일 가입 (허용 목록 밖) | `MemberService.signUp` + 프론트 `/signup` 화면 통째로 교체 |
| 구글 전용 계정의 비밀번호 설정 | `MemberService.changePassword` |
| 재설정으로 비밀번호 **생성** | `PasswordResetService.reset` ← 안 막으면 위 차단이 우회된다 |
| 구글 연결 해제 | `Member.unlinkGoogle` — **항상 거부.** 탈퇴만 |

- 허용 목록은 `app.signup.email-allowlist` (기본 `milo.beene@gmail.com`, **비우면 제한 해제**)
- `application-test.yml`이 비워두므로 기존 테스트는 그대로 돈다.
  **제한이 켜진 동작은 `SignupRestrictionTest`만 검증한다** — 프로퍼티를 직접 주입해서
- 프론트만 막으면 API 직타로 **로그인 못 하는 좀비 계정**이 생겨서 서버에서도 재검증한다

**대가**: 구글 계정을 잃으면 이 서비스 계정도 잃는다. 원래 복구 경로(재설정으로 비밀번호 생성)는
어차피 메일이 안 가서 실효가 없었다.

**원복**: 도메인 인증 → `app.mail.from` 교체 → 허용 목록 비우기 → 위 4개 차단 되돌리기.
스펙 §6.1의 "운영 제약" 박스에 원복 절차가 있다.

---

## 0-4. 가입 승인제 + 감사 후속 (스펙 v1.9)

### 가입 승인제 (FR-ADM-06)
전 구간 무료 티어라 아무나 가입하면 용량이 먼저 터진다. **관리자가 승인해야 로그인된다.**

- 상태는 `member.approved_at` 하나 (null = 대기). 거절 상태는 없다
- 막는 곳은 **로그인 성공 핸들러 두 곳** — `LoginResultHandlers`(폼) + `GoogleOAuth2SuccessHandler`(구글).
  ⚠️ **구글 쪽을 빼먹으면 통째로 우회된다**
- 세션을 안 남기고 403이라 `/api/**`가 전부 401 → DB·R2 접근이 자동으로 막힌다
- 스위치 `app.signup.require-approval` (기본 켬, 테스트는 끔)
- `approved_at`은 새 베이스라인 `V1__init.sql`에 처음부터 들어 있다
- 관리자 화면 회원 탭에 대기 배너 + 승인 버튼

### 감사에서 고친 것
| 고친 것 | 무엇이 문제였나 |
|---|---|
| 회차 삭제 (FR-PT-08 신설) | 백엔드엔 있는데 화면이 없어 **잘못 넣은 회차를 못 지웠다** |
| 취득 삭제 (FR-ACQ-07 신설) | 〃 |
| 구독 수정 | 요금 바뀌면 지우고 다시 만들어야 했다 (연결된 취득이 끊긴다) |
| 플랫폼 계정 필터 (FR-QRY-03) | 백엔드가 `platformAccountId`를 받는데 FilterBox에 칸이 없었다 |
| 관리자 게임 마스터 탭 | FR-ADM-01(MUST)·02·FR-GAME-05가 백엔드만 있고 화면이 없었다 |

삭제 UI는 **편집 다이얼로그 안**에 뒀다 — 표에 열을 더하면 실수 클릭이 는다.

**FR 목록만 훑는 감사로는 회차·취득 삭제를 못 잡는다** — 스펙 자체가 삭제를 안 적었기 때문이다.
엔드포인트 대조(백엔드 69개 ↔ 프론트 호출)를 같이 돌려야 나온다.

### 시드 계정 (dev 인메모리)
| 계정 | 비밀번호 | 권한 | 비고 |
|---|---|---|---|
| `milo.beene@gmail.com` | `1111` | **ADMIN** | 평소 쓰는 계정. 표본 백로그 3건 |
| `admin` | `1111` | ADMIN | 예비. 이메일 형식이 아니라 로그인 입력이 `type="text"`다 |

계정을 나누는 게 원칙(최소 권한)이지만 1인 프로젝트에서 관리 작업마다 로그인을 갈아타는
비용이 더 커서 주 계정을 승격시켰다.

**운영에서 승격하는 법 — DB를 직접 건드리지 않는다.** `ADMIN_EMAIL`·`ADMIN_PASSWORD`
환경변수를 주면 `AdminBootstrap`이 기동 때 **기존 회원을 승격**한다 (멱등, 비밀번호는 안 덮어씀).

### 관리자 화면 (v1.9에서 보강)
- 회원: **이메일 부분 일치 + 가입일 범위 검색.** 승인 대기가 목록 맨 위로 올라온다
- 게임 마스터: 검색어 없이 **전체 목록**(30개씩). `마스터에 없는 게임 포함`을 켜면
  `/api/games`로 갈아탄다 — 외부 검색이라 **검색어가 필수고 페이지네이션이 없다**
- 세 탭 모두 30개씩

---

## 0-2. 검증 항목 상세

### ① 백엔드 스펙 ↔ 프론트 구현 전수 검증
API 응답 **키**는 자동으로 대조된다:
```bash
python3 tools/contract-check.py     # 백엔드를 띄운 채로
```
현재 19개 응답 불일치 0 (선택지 개편 후 재확인 완료).

**그런데 이 도구가 못 잡는 게 있다** — "기능이 통째로 빠진 것".
실제로 그렇게 놓친 적이 있다: FR-TAG-02(태그 이름 변경·삭제, MUST)를 읽기 전용으로 만들었다가
사용자가 지적해서 뒤늦게 붙였다. `googleLinked`도 응답에 아예 없어서 화면이 판단을 못 했다.

→ **`docs/spec-v1.5.md`의 FR 목록(§6)과 백엔드 66개 엔드포인트를 눈으로 대조**해야 한다.
특히 FR-BL / FR-PT / FR-ACQ / FR-TAG / FR-QRY / FR-STAT / FR-AUTH / FR-ADM.

### ② DB 생성 검증
지금까지 **인메모리 H2**로만 확인했다. 실제 스키마는 Flyway `V1__init.sql`이고
`FlywayMigrationTest`가 드리프트를 감시하지만, **Neon(PostgreSQL) 실물에서 확인한 적은 없다.**

확인할 것:
- Neon에 V1이 그대로 올라가 있는지 (O-3에서 적용했다고 기록됨, 실데이터 76건)
- **V2를 Neon에 적용하기 전에 백업.** 마스터 복제 + FK 리매핑이라 되돌리기 어렵다
- 적용 후 확인: 회차의 기기·에뮬·입력 방식, 취득의 플랫폼, 계정의 플랫폼이 전부 내 소유 행을 가리키는지

### ③ 옵시디언 임포트 결과 수정
Phase 7에서 **임포트 기능은 만들지 않기로 하고**(dev-order §Phase 7) 일회성 러너 `VaultLoader`로
실데이터 76건을 Neon에 밀어 넣은 뒤 러너를 삭제했다.

⚠️ **그 러너는 git에 커밋된 적이 없다** (전체 이력 744파일 확인). 되살리려면 처음부터 다시 써야 한다.

사용자가 그 결과물을 고치고 싶어 한다. **무엇을 고칠지는 아직 안 들었다 — 먼저 물어볼 것.**
알려진 데이터 결함:
- `acquisition.acquiredOn`이 **76건 전부 null** → 월별 지출 차트가 빈 상태
- `backlogEntry.playTimeHours`도 **전부 null** → 총 플레이 시간 0

---

## 1. 실행

```bash
# 백엔드 — local의 자격증명(IGDB·구글·Resend)만 쓰고 DB는 인메모리. Neon을 안 건드린다
cd backend && ./gradlew bootRun --args="--spring.profiles.active=dev,local \
  --spring.datasource.url=jdbc:h2:mem:verify;DB_CLOSE_DELAY=-1;MODE=PostgreSQL \
  --spring.datasource.driver-class-name=org.h2.Driver \
  --spring.datasource.username=sa --spring.datasource.password="
```
`driver-class-name`까지 덮어야 한다 — `application-local.yml`이 PostgreSQL 드라이버를 지정한다.

프론트: `cd frontend && npm run dev`

**시드 계정** `milo.beene@gmail.com` / `1111` — 단, 인메모리라 재시작하면 초기화된다.
⚠️ **지금 떠 있는 인스턴스는 시드 비밀번호가 1111이 아니다** (세션 중 변경됨).
재시작하면 1111로 돌아온다.

`frontend/.env.local`의 `NEXT_PUBLIC_DEV_MEMBER_ID`는 **꺼져 있다.** 켜면 로그인 없이
들어가지지만 헤더 인증이 매 요청을 다시 통과시켜 **로그아웃이 안 먹는다.**

---

## 2. Phase 8에서 한 것

### 프론트 (전 화면)
| 구역 | 화면 |
|---|---|
| `(public)` | 입구 · 로그인 · 회원가입 · 이메일 인증 · 비밀번호 재설정 2단계 · 계정 복구 |
| `(app)` | 대시보드 · 라이브러리(그리드/폴더) · 상세(편집 8경로) · 담기 · 설정 · 관리자 |

- Tailwind v4, 유체 WebGL 배경(전역 1장), 공통 컴포넌트 20여 종
- 규칙은 **`docs/design-system.md`가 원본** — 새 화면은 반드시 여기 따를 것
- 상세 편집: 개인기록·오버라이드(+장르)·태그·회차·취득·커버·삭제

### 백엔드 (Phase 8에서 추가/변경)
- **N-2 CORS** — `CorsConfig` + 시큐리티 체인 `.cors()`, OPTIONS permitAll
- `GET /api/backlog/names` — 사이드바 전체 목록
- `GET /api/backlog/companies` — 개발사·유통사 사전 (전체 / 내가 고친 것 두 벌)
- 목록 필터 확장 — `developer` `releaseYear` `platformId` `genreName`
  - **`genreName`이 핵심**: 개인 장르가 마스터를 *덮어쓰므로*(§6.7) id로 거르면 안 된다
- **인증 메일 발송 (OI-02 해소 — Resend)** — SMTP가 아니라 HTTP API
- `PUT /api/me/password` — 비밀번호 변경·설정 (구글 전용 계정이 비번을 만드는 경로)
- `MeResponse.profile`에 `googleLinked` · `hasPassword` 추가
- 구글 OAuth 결과를 **JSON → 프론트 리다이렉트**로 전환
- 비밀번호 최소 길이 8 → 4

**테스트 404개 전부 초록불. 프론트 린트 에러 0.**

---

## 3. 사용자가 지적했던 6건 — 전부 처리됨

1. ✅ 플랫폼 계정 되살리기 — 409 REVIVABLE에 확인 버튼이 없어 아무것도 못 하던 것
2. ✅ 삭제된 참조가 폼에서 사라지던 것 — `lib/options.ts`의 `withCurrent()`로 "(삭제됨)" 항목을 끼워 넣음.
   그대로 두면 저장 시 **원래 붙어 있던 계정이 조용히 날아갔다**
3. ✅ 보유 기기 메모를 마크다운으로 — `MarkdownTextarea`
4. ✅ **보유 기기가 회차 선택지에 안 뜨던 것** → §0-1의 회원 소유 전환으로 해결.
   선택지에 `거실 스위치 (Nintendo Switch)` 꼴로 뜬다
5·6. **인증 메일 — 버그 아님. Resend 제약**

```
You can only send testing emails to your own email address (milo.beene@gmail.com).
To send emails to other recipients, please verify a domain at resend.com/domains
```
`onboarding@resend.dev`는 계정 소유자에게만 발송된다.
**해결은 하나뿐이다: resend.com/domains에서 도메인을 인증한 뒤 `app.mail.from`을 그 도메인 주소로.**
사용자가 도메인을 준비해야 하는 일이라 코드로 풀 수 없다.

임시로는 발송 실패 시 서버 로그에 **수동 링크**가 남는다:
```
수동 링크 : http://localhost:3000/verify-email?token=...
```

---

## 4. 이번 세션에 찾은 함정 (반복 주의)

| 함정 | 증상 |
|---|---|
| **`GoogleLinkSessionFilter` 등록 위치** | `OAuth2AuthorizationRequestRedirectFilter`보다 뒤에 두면 **실행조차 안 된다.** 연결이 신규 가입으로 처리돼 "이미 가입된 이메일"로 튕기고 로그아웃됐다. 실행 확인은 `구글 연결 시작 — memberId=` 로그 |
| **H2 2.4.240 버그** | `insert ... values (…, default)`에 check 제약이 잘못 걸려 회차 추가가 전부 409. `2.3.232`로 핀 고정함 |
| **메일 실패가 가입을 롤백** | 발송이 가입 트랜잭션 안이라 예외를 던지면 회원 생성까지 되돌아갔다 → 삼키고 로그에 링크 |
| **커스텀 CSS가 Tailwind를 이김** | 리셋을 `@layer base` 밖에 두면 `bg-white` 같은 유틸리티가 무력화된다. `.divide-y-line`도 `lg:divide-y-0`을 이긴다 |
| **IGDB 커버 비율** | 실측 264×**352** = 3:4. 문서의 1:1.42는 틀렸다. `t_thumb`/`t_micro`는 **정사각** |
| **검색 결과의 `gameId`가 null** | 마스터에 없는 IGDB 게임은 `externalId`로 담아야 한다 |
| **R2 presigned 서명에 `content-length` 포함** | 신고한 `sizeBytes`와 실제 파일 크기가 다르면 403 `SignatureDoesNotMatch` |
| **에러 문구 뭉개짐** | `caught instanceof ApiError ? … : 폴백`은 클라이언트 검증 문구를 삼킨다 → `errorMessage(caught, fallback)` 사용 |
| **마이그레이션 테스트의 explicit id** | 픽스처가 `insert ... (id, ...)`로 id를 박으면 identity 카운터가 안 올라가, 마이그레이션의 INSERT가 PK 충돌로 죽는다. 운영에선 Hibernate가 넣어 안 생기는 문제 — 픽스처에서 id를 빼야 한다 |
| **`main`이 스크롤 컨테이너** | 설정 화면은 `window.scrollTo`가 안 먹는다. `document.querySelector("main").scrollTop`을 써야 한다 |

---

## 5. 자격증명 (전부 `backend/src/main/resources/application-local.yml`, gitignore됨)

| | 상태 |
|---|---|
| Neon PostgreSQL | ✅ |
| 구글 OAuth | ✅ (연동 성공 확인됨 — 시드 계정이 `googleLinked: true`) |
| IGDB | ✅ (검색·담기 실동작 확인) |
| Resend | ✅ (발송 성공, 단 소유자 주소 한정) |
| R2 스토리지 | ✅ (업로드 3단계 왕복 확인) |

⚠️ Resend API 키가 채팅에 평문으로 노출됐다. 회전 권장.

---

## 6. 남은 로드맵

- **Phase 9 배포** — O-2(PostgreSQL 실행계획·인덱스 재검토) · O-3(Render/Vercel) · O-4(Spring Session JDBC) · O-5(HikariCP)
- **Phase 10** — P-1 스크린샷/영상 · P-2 환율 배치
- **미결** — FR-BL-09 변경 이력(`EntitySnapshot` 엔티티만 있고 경로 없음, SHOULD)
- **이메일 변경** — 버튼만 있고 비활성(`준비 중`). 만들려면 스펙에 FR 신설 먼저

## 참조 문서
`CLAUDE.md` → `docs/spec-v1.5.md`(판단 기준) · `docs/design-system.md`(화면 규칙) ·
`docs/api-design-v0.2.md` · `docs/dev-order.md` · `docs/frontend-impl-notes.md` · `docs/design-request.md`


---

## 커밋 (아직 안 함)

야간 작업은 5개로 나뉜다. 앞 4개는 이미 커밋됐고 **마지막 하나만 남았다**:

```
fix(phase9): 코드 리뷰 확정 21건 조치 — 구글 세션 무효화·탈퇴 배치 트랜잭션·커버 업로드 2건, Testcontainers 부분 도입
```

## 다음에 할 일

> **상세 계획은 `docs/next-session-plan.md`** — 설계 판단이 남지 않는 수준으로 쪼개뒀다.

| 순서 | 내용 |
|---|---|
| 0 | ✅ **태그 단일화** (2026-08-26) — 항목당 태그 1개. 스펙 §6.7 v1.6 |
| 1 | **Neon 스키마 재적용** — V1 체크섬이 바뀌었다. `drop schema` 필요 |
| 1 | **배포** (Render/Vercel) — 반응형·PWA·일렉트론의 선행 조건 |
| 2 | 옵시디언 76건 재투입 — ⚠️ **`VaultLoader`는 git에 커밋된 적이 없어 복구 불가.** 처음부터 다시 써야 한다 (볼트 위치·노트 형식 확인 필요) |
| 3 | 반응형 (구조 6곳, 모바일 퍼스트) → PWA |
| 4 | **IGDB 처리율 게이트 + /admin 시스템 탭** — `capacity-planning.md`의 A·B·모니터링 |
| 5 | 일렉트론 (구글 OAuth 딥링크 필요 — 도메인 안 사기로 확정했으므로) |

### 아침에 결정할 것

- **폴더명**: `cd ~/projects/Practice && mv game-backlog starlog` (세션 작업 디렉터리라 밤에 못 건드렸다)
- **구글 OAuth 동의 화면 App name** → `STARLOG` (콘솔에서 직접, 코드로 안 됨)
- **알려진 한계 3건**을 고칠지 — `code-review-2026-08-26.md` 마지막 표
