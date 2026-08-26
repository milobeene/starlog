# 다음 세션 작업 계획 (2026-08-26 작성, 오후 갱신)

> 현재 상태: 태그 단일화 + 폴더명 + Neon 재적용 + **O-4 세션 DB화 + O-5 풀 튜닝 완료.**
> 테스트 421개 초록. Neon은 V2까지 적용됨(테이블 26개).
> → **남은 건 네가 Render/Vercel 대시보드에서 할 일뿐이다** (2-1, 2-2, 2-3).
>
> 이 문서는 **설계 판단이 남지 않을 정도로** 촘촘하게 쓴 것이다. `[결정 필요]` 표시가 붙은 곳만
> 사용자 답이 있어야 하고, 나머지는 그대로 실행하면 된다.

## 배포 주소 (2026-08-26)

| 대상 | 주소 | 비고 |
|---|---|---|
| 프론트 (사용자가 접속) | https://starlog-xi.vercel.app | Vercel — 배포·환경변수는 대시보드에서 |
| 백엔드 (API) | https://starlog.onrender.com | Render 무료 — 15분 무활동 시 슬립, 콜드스타트 최대 50초+ |
| DB | Neon (`ep-restless-recipe-azqn40hd`) | 접속정보는 `backend/src/main/resources/application-local.yml` (git 미포함) |

`starlog.vercel.app`(접미사 없는 깔끔한 이름)은 선점되어 있어 `-xi`가 자동으로 붙었다.
Vercel 프로젝트 → Settings → Domains에서 다른 이름으로 재시도 가능 — 바꾸면 Render의
`CORS_ALLOWED_ORIGINS`·`FRONTEND_BASE_URL`도 같이 갱신해야 한다.

---

## 0. 세션 시작 시 30초 점검

```bash
cd ~/projects/Practice/starlog
git log --oneline -1                      # 태그 단일화 커밋이 최신이어야 함
cd backend && ./gradlew test              # 421개 초록 (도커 필요 — PostgresSchemaTest)
```

⚠️ **도커가 꺼져 있으면 `PostgresSchemaTest`가 실패한다.** `open -a Docker` 후 20초.

---

## 작업 1. ~~Neon 스키마 재적용~~ — ✅ **2026-08-26 완료**

`drop schema public cascade` → `prod,local` 기동으로 새 V1 적용 → 스키마 17항목 검수 통과.
상세는 `docs/db-baseline-v1.md`의 "재적용 #2".

**Neon 현재 상태: 빈 테이블 24개 + flyway 이력 V1 한 줄 (checksum 290737956).**

---

## 작업 2. 배포 (Phase 9 O-3~O-5)  ★ 최우선

**왜 최우선인가** — 반응형·PWA·일렉트론이 전부 이것의 하류다. 폰에서 열어봐야 반응형을 고칠 수 있고,
일렉트론은 로드할 URL이 있어야 한다.

### 2-1. 백엔드 → Render  [사용자 작업 + 내 작업]

**사용자가 할 것** (내가 못 하는 것: 계정·대시보드·환경변수 입력)
1. Render에서 `New > Web Service` → 이 저장소 연결 → **Root Directory `backend`**
2. **Docker 방식이다** — Render는 Java 네이티브 런타임이 없다(Node/Python/Ruby/Go/Rust만 있음).
   Root Directory를 backend로 잡으면 Render가 자동으로 Dockerfile을 찾아 Docker Build Context /
   Dockerfile Path를 `backend/`로 제안한다. `backend/Dockerfile`(멀티스테이지: JDK로 빌드,
   JRE로 실행)을 이미 만들어뒀고 로컬 `docker build` + 컨테이너 기동으로 검증 완료
3. Language 필드가 Node로 자동 감지되면 무시해도 된다 — Root Directory를 backend로 지정하는
   순간 Docker 옵션으로 바뀐다. Build/Start Command 칸은 Dockerfile이 대신하므로 비워둔다
4. Compute Plan은 **Free** — 계획 전제가 무료 티어다 (그래서 O-4로 세션을 DB로 옮겼다)
3. 환경변수 입력:

| 키 | 값 |
|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` |
| `DATABASE_URL` / `DATABASE_USERNAME` / `DATABASE_PASSWORD` | Neon 대시보드 값 (`application-local.yml`에 있음) |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | 〃 |
| `STORAGE_ENDPOINT` / `STORAGE_BUCKET` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` / `STORAGE_PUBLIC_BASE_URL` | 〃 (R2) |
| `RESEND_API_KEY` | 〃 — ⚠️ **채팅에 평문 노출된 적 있음. 회전 권장** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 〃 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 관리자 부트스트랩. `milo.beene@gmail.com`을 넣으면 **기존 회원을 승격**한다(멱등) |
| `CORS_ALLOWED_ORIGINS` | Vercel 주소 (2-2 후에 채운다) |
| `FRONTEND_BASE_URL` | 〃 |
| `SIGNUP_EMAIL_ALLOWLIST` | 기본값 그대로면 생략 |

**내가 할 것**: `application-prod.yml`에 아직 없는 키가 있으면 채우고, 기동 로그로 검증.

### 2-2. 프론트 → Vercel  [사용자 작업]
1. `New Project` → **Root Directory `frontend`**
2. 환경변수 `NEXT_PUBLIC_API_BASE` = Render 백엔드 URL
3. 배포 후 나온 Vercel URL을 Render의 `CORS_ALLOWED_ORIGINS`·`FRONTEND_BASE_URL`에 넣고 재배포

### 2-3. 구글 OAuth 리디렉션 URI 추가  [사용자 작업]
콘솔 → `Credentials` → OAuth 클라이언트 → **승인된 리디렉션 URI**에
`https://{render주소}/login/oauth2/code/google` 추가. 안 하면 구글 로그인이 `redirect_uri_mismatch`로 죽는다.

### 2-4. ~~O-4 Spring Session JDBC~~ — ✅ **2026-08-26 완료**

**이걸 배포 뒤로 미루면 안 되는 이유**: Render 무료는 **15분 무활동이면 JVM이 죽는다.**
세션이 메모리에 있으므로 **깰 때마다 전원 로그아웃**된다. 지인 몇 명이 가끔 쓰는 패턴이면
사실상 매번 로그인해야 한다 — 앱이 못 쓸 물건이 된다.

- `spring-session-jdbc` 추가, 세션 테이블은 **마이그레이션 V2로 직접 작성**
  (Spring Session이 제공하는 스키마를 그대로 쓰되, V1과 같은 손감사 규칙 적용)
- ⚠️ **`SessionRegistry`도 같이 봐야 한다.** 지금은 JVM 메모리라 재시작 시 비고,
  그러면 전 세션 무효화(FR-AUTH-05·09)가 조용히 0건이 된다 — 오늘 고친 그 버그와 같은 종류다.
  `SpringSessionBackedSessionRegistry`로 교체할 것
- 검증: `PostgresSchemaTest`에 세션 테이블 제약 단언 추가 + 재시작 후 로그인 유지 수동 확인

### 2-5. ~~O-5 HikariCP 튜닝~~ — ✅ **2026-08-26 완료** (`maximum-pool-size: 5`, prod 전용)
Neon 무료는 유휴 시 컴퓨트를 재운다. 기본 풀(10)은 무료 티어에 과하다.
`maximum-pool-size: 5`, `idle-timeout`·`max-lifetime`을 Neon 유휴 임계보다 짧게.
`application-prod.yml`에만 넣는다 (dev H2는 그대로).

### 2-6. 배포 후 종단 검증  [내 작업]
구글 로그인 → 승인 대기 확인 → 관리자 승인 → 담기 → 회차 → 커버 업로드 → 통계.
**커버 업로드가 제일 위험** — R2 CORS 설정이 Vercel 도메인을 허용해야 브라우저 직접 PUT이 된다.

---

## 작업 3. ~~옵시디언 재투입~~ — **폐기 (2026-08-26 결정)**

임포터는 만들지 않는다. 실데이터는 배포 후 화면에서 직접 담는다.

참고로 `VaultLoader`는 **git에 커밋된 적이 없어** 복구도 불가능했다(전체 이력 744파일 확인) —
인수인계 문서의 "이력에서 부활시키면 된다"는 서술은 틀린 것이었다.

### DB 초기화는 이미 끝났다
"엔티티가 많이 바뀌었으니 테이블 다 내리고 다시 검수해서 쿼리 날려야 한다"는 판단은 맞고,
**그 작업을 2026-08-26 밤에 이미 했다**:
- V1~V3 마이그레이션을 청산하고 현재 엔티티 기준으로 **V1을 손으로 다시 작성** (`db-baseline-v1.md`)
- 3렌즈 미니 리뷰로 검수 → 정렬 인덱스 2종·방향 명시·auth_token 인덱스 보강
- Neon `drop schema` → 새 V1 적용 → API 왕복 검증 → 검증 데이터 청소

**현재 Neon 상태: 빈 테이블 24개 + flyway 이력 V1 한 줄** (2026-08-26 재적용 후).

---

## 작업 4. 사이드바 태그 그룹 + 반응형

**좋은 소식: 예상보다 작다.** 실측해보니 이미 되어 있는 게 많다.
- `DataTable` — 이미 `overflow-x-auto` + `min-w-[520px]`. **손댈 것 없음**
- 상세 페이지 — 이미 `grid-cols-1 lg:grid-cols-3`. **손댈 것 없음**
- 라이브러리 그리드 — 이미 `2 → 3 → 4 → 6 → 8` 램프. **손댈 것 없음**

**실제로 남은 것 4곳:**

| 곳 | 현재 | 할 일 |
|---|---|---|
| `LibrarySidebar` | `w-64` 고정 + `mt-20 ml-6` (사방이 떠 있는 글래스 패널) | **왼쪽만 화면에 붙이고 위·아래·오른쪽은 계속 띄운다.** 기본은 얇게(커버 썸네일만), 토글로 확장 |
| `AppHeader` | `px-8` + 가로 3분할 (`w-1/3` ×3) | 좁으면 로고 + 햄버거 + 프로필로 축소 |
| `FilterBox` | `grid-cols-1 sm:2 lg:3 xl:5` | 이미 접히지만 모바일에서 세로가 너무 길다 — 접이식으로 |
| 다이얼로그 7개 | `grid-cols-2` 고정 | `grid-cols-1 sm:grid-cols-2` |
| `FluidBackground` | 항상 WebGL 렌더 | 모바일·`prefers-reduced-motion`이면 정적 그라데이션 |

마지막 항목은 **배터리·발열 문제**라 실기기 확인이 필요하다.

### 4-1. 사이드바 태그 그룹  ★ 원래 요청인데 안 지켜진 것

**지금**: 게임 이름만 평평하게 나열.
**되어야 할 것**: 게임 목록은 그대로 두되 **태그별로 묶고, 그룹마다 접히는 토글**을 둔다.

> **태그 단일화로 이 작업이 줄었다.** 한 게임은 한 그룹에만 들어가므로 중복 처리가 없고,
> 카드 DTO에 `tag`가 실려 오므로 **API를 새로 만들 필요가 없다.** 사이드바가 지금 쓰는
> `findNames`(id·이름 프로젝션)에 태그를 얹을지, 목록 API를 그대로 쓸지만 정하면 된다.

- **정렬은 항상 이름순** — 그룹 안에서도, 그룹 자체도. 다른 정렬 옵션 없음
- 태그 없는 게임은 맨 아래 그룹으로 (`태그 없음`)
- ⚠️ **너무 눈에 띄지 않게.** 헤더는 얇은 라벨 + 개수 정도로 디자인에 녹인다.
  이건 필터 UI가 아니라 **목록에 결을 주는 장치**다
- 필터링은 지금처럼 `FilterBox`가 계속 맡는다 — 사이드바는 이동용 목록이지 필터 surface가 아니다

> `docs/design-request.md` §3-1의 "접히는 그룹 5개(STATUS/TAGS/GENRES/DEVICES/ACCOUNTS)"는
> **이 항목이 아니다.** 그 안은 폐기됐고 필터는 FilterBox로 갔다. 혼동하지 말 것.

---

## 작업 5. PWA  (반응형 직후, 거의 공짜)
`manifest.json` + 아이콘 + `next-pwa` 또는 수동 서비스워커. 홈 화면 아이콘 + 전체화면.
**오프라인 캐싱은 하지 않는다** — 데이터가 서버에 있고 캐시 무효화 비용만 는다.

---

## 작업 6. IGDB 안내 + 일일 쿼터 + /admin 시스템 탭

근거와 수치는 `docs/capacity-planning.md`에 있다. 요약:
- **IGDB만 실질 병목** (초당 4 / 동시 8, **앱 전체 기준**). R2·Neon은 여유
- 지금은 429가 502로 올라가 "외부 DB 오류"로 보인다

### 6-1. IGDB 한도 초과 시 동작  [확정]
**기다리지 않고 즉시 안내한다.** 큐·재시도 없음.
문구는 "잠시 후"가 아니라 **"지금 여러 분이 동시에 검색 중입니다. 바로 다시 시도해 주세요."**
— 초당 4건이라 실제로 1초 안에 풀린다. 기다리게 하면 오히려 멈춘 것처럼 보인다.

### 6-2. 회원당 일일 쿼터  [확정 — 사용자 요청]
**"모르고 막히는 것"보다 "하루에 몇 건까지인지 보이는 것"이 낫다**는 방침.
최대 사용자 10명 기준으로 잡는다.

| 대상 | 일일 한도(회원당) | 근거 |
|---|---|---|
| IGDB 검색 | 200 | 앱 전체 초당 4건. 한 세션에 20~30건이면 충분 |
| 게임 담기(마스터 다운로드) | 50 | IGDB 상세 호출 + 마스터 생성이라 검색보다 무겁다 |
| 커버 업로드 | 20건 / 총 200MB | R2 10GB ÷ 10명 = 1GB지만 여유를 크게 둔다 |

- **카운터는 DB에 저장한다** (`usage_quota(member_id, date, kind, count)`).
  인메모리로 두면 Render가 15분마다 재시작해 쿼터가 무의미해진다 → **V2 마이그레이션에 포함**
- **설정 화면에 남은 쿼터를 표시한다** — "오늘 검색 180/200" 식. 이게 이 방침의 핵심이다
- 서버 요청 **전체**에 대한 캡은 두지 않는다 — 페이지 한 번 여는 데 5요청이 나가서
  숫자가 사용자에게 의미를 못 주고, Render·Neon 한도는 요청 수가 아니라 **가동 시간·컴퓨트 시간**이다

### 6-3. /admin 시스템 탭
IGDB 호출 수·429 발생 수·회원별 쿼터 소진·R2 사용량(`CoverImage.sizeBytes` 합)·
Neon 스토리지(`pg_database_size()`). Actuator를 붙이되 **외부 모니터링 도구는 안 쓴다**.

---

## 작업 7. 일렉트론  (맨 마지막)

**선행 조건**: 배포 완료 (로드할 URL 필요).
**핵심 난관**: 구글이 임베디드 웹뷰 OAuth를 차단한다 → 시스템 브라우저 + 딥링크.
도메인을 안 사기로 확정했으므로 **이 우회는 선택이 아니라 필수**다.

- 백엔드에 일회용 토큰 교환 엔드포인트 신설
- 앱은 `starlog://` 커스텀 스킴 등록, 시스템 브라우저에서 로그인 → 토큰으로 세션 교환
- 앱 본체는 **배포 URL을 로드하는 얇은 껍데기** (프론트 번들 X — CORS·쿠키 문제가 되살아난다)

---

## 알려진 한계 3건 — **문서로 둔다 (2026-08-26 확정)**

재발송 스로틀 레이스 / 플랫폼 삭제 경합 / 병합 레이스.
1인 습작 + 지인 몇 명이면 도달 확률이 극히 낮다. 근거는 `docs/code-review-2026-08-26.md` 마지막 표.
**고치지 않는다** — 사용자가 늘거나 실제로 겪으면 그때 재검토.

---

## 우선순위 요약

```
0. 태그 단일화 + 폴더명 + Neon 재적용   ✅ 2026-08-26 완료
2. 배포 + O-4 세션 + O-5 풀      ★ 나머지 전부의 선행 조건
3. 사이드바 태그 그룹 + 반응형 4곳 → PWA
4. IGDB 안내 + 일일 쿼터 + /admin 시스템 탭
5. 일렉트론
```

**폐기**: 옵시디언 임포터, 알려진 한계 3건 수정.
**미결 없음.**


---

## 결정 완료 — 게임당 태그 **하나** (2026-08-26)

`backlog_entry_tag` 조인 테이블 폐기 → `backlog_entry.tag_id` nullable FK.
근거·감수·구현 범위는 `docs/spec-v1.5.md` §6.7의 "항목당 태그는 하나다" 박스와
`docs/db-baseline-v1.md`에 적어뒀다.

**딸려온 것**: 폴더 뷰가 태그마다 목록 API를 때리던 1+N 요청이 한 방이 됐다.
