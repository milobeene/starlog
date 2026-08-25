# Phase 8 인수인계 (2026-08-25)

프론트엔드가 **전 화면 구현 완료** 상태다. 백엔드도 Phase 8에서 여러 번 손댔다.
**커밋은 아직 안 했다** — 변경 73건(수정 54, 신규 19)이 워킹 트리에 있다.

---

## 0. 지금 바로 할 일 (사용자 요청)

### ① 백엔드 스펙 ↔ 프론트 구현 전수 검증
API 응답 **키**는 자동으로 대조된다:
```bash
python3 tools/contract-check.py     # 백엔드를 띄운 채로
```
현재 19개 응답 불일치 0.

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
- Phase 8에서 엔티티를 건드렸는지 → **안 건드렸다.** 추가된 건 DTO·쿼리·설정뿐이라 V2는 아직 없다
- 단, 아래 §3의 "보유 기기" 개선을 하면 **V2 마이그레이션이 필요해진다**

### ③ 옵시디언 임포트 결과 수정
Phase 7에서 **임포트 기능은 만들지 않기로 하고**(dev-order §Phase 7) 일회성 러너 `VaultLoader`로
실데이터 76건을 Neon에 밀어 넣은 뒤 러너를 삭제했다.

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

## 3. 진행 중이던 것 — ⚠️ 여기부터 이어서

사용자가 6개를 지적했고 **1~3만 끝냈다.**

### ✅ 끝난 것
1. **플랫폼 계정 되살리기** — 409 REVIVABLE에 확인 버튼이 없어 아무것도 못 하던 것 → `ConfirmDialog`로 복원
2. **삭제된 참조가 폼에서 사라지던 것** — `lib/options.ts`의 `withCurrent()`로 "(삭제됨)" 항목을 끼워 넣음.
   그대로 두면 저장 시 **원래 붙어 있던 계정이 조용히 날아갔다**
   - 삭제에 확인 다이얼로그 추가 (계정=복원 가능 / 기기=복원 불가로 문구가 갈림)
3. **보유 기기 메모를 마크다운으로** — `MarkdownTextarea`

### ❌ 남은 것 — **4번. 설계 결정이 필요하다**

> 사용자 요구: 보유 기기가 회차 선택지에 뜨고, 같은 기종이 여러 대면 **라벨로 구분**되어야 한다.
> `거실 스위치 (Nintendo Switch)`처럼.

**현재 구조가 그걸 못 한다:**
```
Playthrough.device  →  Device (마스터: "Nintendo Switch")
MemberDevice        →  내 기기 (라벨 "거실 스위치" + Device 참조)   ← 회차가 참조하지 않는다
```
`/api/me/options`의 `devices`는 **마스터 전체**다. 그래서 보유 기기를 추가해도 회차 선택지에 안 뜨고,
같은 기종 2대를 구분할 수 없다.

**이건 스펙이 의도한 설계다** — BR-PT-05: "기기는 마스터 전체를 준다. 보유 기기 목록은
우선 표시일 뿐 제약이 아니다 (친구 집에서 빌려 플레이한 기록)".
즉 사용자 요구는 **스펙 개정 + 엔티티 변경**이다.

**제안안 (승인 필요):**
- `playthrough`에 `member_device_id` 컬럼 추가 (nullable) → **V2 마이그레이션 필요**
- 기존 `device_id`는 유지 — 통계·필터가 마스터 기준이라 보유 기기를 고르면 그 기기의 Device를 함께 채운다
- `/api/me/options`의 `devices`를 둘로: `myDevices`(라벨+기종) / `allDevices`(마스터)
- BR-PT-05는 살린다 — 마스터 기기도 계속 고를 수 있어야 "친구 집" 케이스가 남는다
- 스펙에 FR/BR 개정 기록

### 5·6. 인증 메일 — **버그 아님. Resend 제약**
사용자가 "milo.beene@gmail.com로만 간다"고 했는데 **맞다.**
```
You can only send testing emails to your own email address (milo.beene@gmail.com).
To send emails to other recipients, please verify a domain at resend.com/domains
```
`onboarding@resend.dev`는 계정 소유자에게만 발송된다.
**해결: resend.com/domains에서 도메인 인증 후 `app.mail.from`을 그 도메인 주소로.**

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
