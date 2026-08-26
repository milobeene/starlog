# 웹 서비스 전용 항목 목록 — 로컬 앱(v1.0)으로 갈 때 떼어낼 것

> 2026-08-26 작성. **v0.1 시점의 코드 전수 조사.**
> 목적 둘: (1) 로컬 앱 전환 때 뭘 떼는지 미리 안다 (2) 앞으로 web 전용 기능을
> **떼기 쉬운 모양으로** 짓는다.

## 0. 판정 기준

세 통으로 나눈다.

| | 뜻 |
|---|---|
| 🔴 **떼어낼 것** | 로컬 앱에서는 존재 이유가 사라진다. 코드가 통째로 빠진다 |
| 🟡 **모양이 바뀔 것** | 개념은 남는데 구현이 달라진다 (예: 세션 → 없음, Neon → 파일 DB) |
| 🟢 **그대로 남을 것** | 웹이든 로컬이든 필요하다 |

로컬 앱의 전제: **1인 1기기, 서버 없음, 데이터는 로컬 파일.**
그래서 "여러 사람이 한 서버를 나눠 쓴다"에서 나온 것은 전부 🔴다.

---

## 1. 인증 · 계정

| 항목 | 코드 | 판정 | 근거 |
|---|---|---|---|
| 이메일/비밀번호 로그인 | `auth/service/AuthService`, `MemberDetailsService` | 🔴 | 내 컴퓨터의 내 앱에 로그인할 이유가 없다 |
| 세션 (Spring Session JDBC) | `common/config/SessionConfig`, `V2__spring_session.sql` | 🔴 | 세션은 상태 없는 HTTP를 위한 장치다 |
| CSRF 이중 제출 쿠키 | `auth/web/CsrfCookieFilter`, `CsrfTokenIssuer` | 🔴 | 공격자가 내 브라우저를 시켜 요청을 보낼 수 없다 |
| CORS | `common/config/CorsConfig` | 🔴 | 프론트·백이 같은 프로세스가 된다 |
| 동시 세션 무효화 | `auth/security/SessionInvalidator` | 🔴 | 세션이 없다 |
| 이메일 인증 | `EmailVerificationService`, `AuthToken` | 🔴 | 확인할 상대가 나뿐이다 |
| 비밀번호 재설정 | `PasswordResetService` | 🔴 | 〃 |
| 메일 발송 (Resend) | `ResendAuthMailSender`, `MailConfig` | 🔴 | 위 둘이 사라지면 쓸 곳이 없다 |
| 회원 탈퇴 · 유예 · 파기 배치 | `WithdrawalService`, `MemberPurgeService` | 🔴 | 앱을 지우면 끝이다 |
| **구글 로그인 (OAuth2)** | `GoogleAccountService`, `GoogleOAuth2*Handler` | 🟡 | 아래 박스 |
| 개발용 헤더 인증 | `DevAuthConfig`, `DevHeaderAuthenticationFilter` | 🔴 | 로그인 자체가 없어진다 |

> **구글 로그인은 "로컬 앱에 로그인하려고" 필요한 게 아니다.**
> 로컬 앱은 로그인 없이 열려야 한다 — 내 컴퓨터의 내 파일이다.
> 구글 OAuth가 남는 경우는 **하나뿐이다: 클라우드 백업/동기화를 붙일 때.**
> 그때는 "앱에 들어가는 열쇠"가 아니라 "내 드라이브에 접근하는 허가"로 성격이 바뀐다.
> 일렉트론에서는 리다이렉트 URI가 `http://127.0.0.1:<임의포트>`인 **루프백 흐름**이라
> 지금의 서버 리다이렉트 코드는 재사용되지 않고 새로 짜야 한다.
> → **동기화를 안 붙이면 🔴, 붙이면 🟡(새로 짬).** v1.0 범위를 정할 때 결정할 것.

---

## 2. 다인 서비스라서 있는 것

| 항목 | 코드 | 판정 | 근거 |
|---|---|---|---|
| 가입 승인제 (FR-ADM-06) | `MemberApprovalService`, `member.approvedAt` | 🔴 | 무료 티어 용량을 지키려던 장치다 |
| 이메일 허용목록 | `app.signup.email-allowlist` | 🔴 | 〃 |
| 권한(ADMIN/USER) | `MemberRole`, `SecurityConfig`의 `hasRole` | 🔴 | 나 하나뿐이면 전원이 관리자다 |
| `/admin` 화면 전체 | `admin/**`, `app/(app)/admin` | 🔴 | 회원·승인·감사로그가 전부 다인 전제 |
| 감사 로그 | `AuditLog`, `AuditLogInterceptor`, 보존 배치 | 🔴 | "누가 했나"를 물을 상황이 없다 |
| **일일 쿼터** (이번에 추가) | `usage_quota`, `QuotaService` | 🔴 | **한 서버를 여럿이 나눠 쓸 때만 의미가 있다** |
| **IGDB 전역 게이트** (이번에 추가) | `HttpIgdbClient`의 세마포어 | 🟡 | 초당 4건은 여전하지만 **경쟁자가 나뿐**이라 큐가 필요 없다. 단순 간격 제한으로 축소 |
| `/admin` 시스템 탭 (이번에 추가) | 아래 §5 | 🔴 | 남의 사용량을 볼 일이 없다 |
| `memberId` 스코핑 | 거의 모든 서비스의 `findByMemberIdAnd...` | 🟡 | 열은 남기고 값은 항상 1. 지우면 스키마 전체가 흔들려 **건드리지 않는 게 싸다** |

---

## 3. 인프라 · 배포

| 항목 | 판정 | 로컬 앱에서는 |
|---|---|---|
| Neon PostgreSQL | 🟡 | 파일 DB(H2 파일 / SQLite). **Flyway 이력은 그대로 쓴다** |
| Render (Docker, 스핀다운) | 🔴 | 백엔드가 앱 안에서 뜬다 → 콜드스타트 자체가 없어진다 |
| Vercel | 🔴 | Next.js를 정적 내보내기 하거나 일렉트론이 직접 서빙 |
| `backend/Dockerfile` | 🔴 | |
| Cloudflare R2 (presigned PUT) | 🟡 | **커버를 로컬 폴더에 저장한다.** `FileStoragePort`가 이미 인터페이스라 **구현 하나만 갈아끼우면 된다** — 이 추상화가 여기서 값을 한다 |
| `SameSite=None; Secure` 쿠키 | 🔴 | 쿠키가 없다 |
| 콜드스타트 안내·입구 로딩 연출 | 🟡 | 로딩이 순식간이라 연출의 근거가 사라진다. 남길지는 취향 |

---

## 4. 그대로 남는 것 🟢

- **도메인 전부** — `backlog/`, `game/`, `platform/`, `tag/`, `subscription/`, `stats/`
- **IGDB 연동 자체** (§6 단서 참고)
- 커버 2단 폴백, 표시값 규칙(오버라이드 > 마스터), 파생 상태 계산
- Flyway 마이그레이션 체계, `BaseRepository`, QueryDSL
- 프론트 화면 전부 — 대시보드·라이브러리·상세·설정
- 유체 배경, 폰트, 헤더, **배경 색상 설정**(이번에 추가 — 저장 위치만 계정 → 앱 설정 파일로)

---

## 5. 이번 작업(v0.1 마지막)을 **떼기 쉽게** 짓는 방법

지금 추가하는 셋 중 둘이 🔴다. 나중에 찾아 헤매지 않도록 **처음부터 격리해서 짓는다.**

### 규칙 1 — 스프링 프로파일 `local-app`
빈 하나가 통째로 웹 전용이면 `@Profile("!local-app")`을 붙인다.

**`web` 프로파일을 켜는 방식이 아니라 `local-app`이 스스로 손드는 방식이다.**
오늘의 동작이 기본이어야 지금 개발·배포·테스트가 아무것도 안 바뀐다 — 미래의 변종이
플래그를 드는 게 맞지, 현재를 플래그 뒤에 숨기면 실행 명령마다 프로파일이 하나 붙는다.

호출부는 인터페이스로 받고 로컬용 no-op 구현을 두면 조건문이 안 퍼진다. **실제 구현이 이렇다:**

```java
public interface QuotaGuard { void consume(Long memberId, QuotaKind kind); ... }

@Profile("!local-app") @Service class DbQuotaGuard   implements QuotaGuard { ... }
@Profile("local-app")  @Component class NoOpQuotaGuard implements QuotaGuard { /* 빈 몸통 */ }
```

같은 방식으로 `SystemStatusService`도 `@Profile("!local-app")`이다.

### 규칙 2 — `WEB-ONLY:` 주석 태그
프로파일로 못 자르는 조각(컨트롤러 메서드 하나, 화면 한 줄)에는 주석을 남긴다.
**목록이 곧 체크리스트가 된다:**

```bash
grep -rn "WEB-ONLY" backend/src frontend/src
```

### 규칙 3 — 쿼터 표시는 화면에서 조건부로
설정 화면의 "오늘 검색 12/200"은 `GET /api/me/quota`가 **빈 배열이면 통째로 안 그린다**
(`QuotaSection`이 `null`을 반환한다). 404가 아니라 빈 배열인 이유 — 에러 처리 분기가 안 늘어난다.
`NoOpQuotaGuard`가 빈 목록을 주므로 **백엔드 프로파일 하나로 화면까지 따라 사라진다.**

### 규칙 4 — 배경 색상은 **읽는 곳을 한 군데로**
지금은 `member.background_colors`에서 오지만 v1.0에서는 앱 설정 파일에서 온다.
프론트가 `me.profile.backgroundColors`를 여기저기서 읽으면 그때 전부 고쳐야 한다.
→ **`lib/palette.ts`의 `paletteOf()` 하나만 읽는다.** 출처가 바뀌면 그 함수만 고친다.

### 체크리스트 뽑기
```bash
grep -rn "WEB-ONLY" backend/src frontend/src docs
```

---

## 6. v1.0 계획에 미리 박아둘 단서 셋

1. **IGDB 자격증명을 클라이언트에 심을 수 없다.**
   Twitch client secret이 앱 바이너리에 들어가면 추출된다. 로컬 앱의 IGDB 호출은
   ⓐ 얇은 프록시 서버를 남기거나 ⓑ 사용자가 자기 키를 넣게 하거나
   ⓒ 마스터 데이터를 미리 받아 동봉하는 셋 중 하나다. **ⓐ면 "서버 없음"이 깨진다** —
   v1.0 범위를 정할 때 제일 먼저 결정할 것.
2. **`FileStoragePort` 덕분에 커버는 싸다.** 로컬 파일 구현 하나면 끝난다.
3. **`memberId`를 걷어내지 않는다.** 스키마·쿼리·QueryDSL이 전부 그 열에 매여 있어
   제거 비용이 이득보다 크다. 값이 항상 1인 열로 두는 게 맞다.
