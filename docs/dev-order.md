# 게임 백로그 — 개발 순서 (스펙 v1.4 기준)

> ## 📕 이 문서는 v0.1에서 닫혔다 — 2026-08-27
>
> 슬라이스 A~P는 웹 서비스(v0.1)를 짓는 순서였고 **v0.1은 완료·태그됨.**
> v1.0(데스크탑)의 작업 순서는 여기가 아니라 `docs/v1.0-plan.md`에서 이어진다.
> 구조는 `docs/v1.0-architecture.md`.

> 기능명세서 v1.4의 FR/BR 전수를 페이즈·슬라이스로 배치한 문서.
> 재개할 때 "슬라이스 X의 N번부터"로 참조한다. 체크는 직접 표시.
> 원칙: 슬라이스 하나 = 개발 → SQL 로그 확인 → 테스트 초록불 → 다음.

---

## Phase 1 — 핵심 도메인 (서비스 계층까지만, 웹 계층 없음)

### 슬라이스 A — BacklogEntry CRUD

- [ ] A-1. 게임을 백로그에 담기 (FR-BL-01) + 중복 방지 앱 검증 (FR-BL-02)
- [ ] A-2. 개인 기록 수정 — 평점(0.0~100.0, BigDecimal)·플레이시간·메모 (FR-BL-05, 06, 07) — 변경 감지로
- [ ] A-3. 오버라이드 수정/삭제 (FR-BL-03, 04) — 게임명·개발사(List)·퍼블리셔(List)·출시일·정가
  - 표시값 계산 `오버라이드 ?? 마스터`를 엔티티 한 곳에만 (§5.2, 리스트는 `isEmpty()` 기준)
  - `nameOverride` 변경 → `displayName` 재계산. 갱신 경로를 한 메서드로 (§7.2)
- [ ] A-4. 소프트 삭제 (FR-BL-08) — `deletedAt` 설정
- [ ] A-5. 되살리기(revive) — 재추가 시 3분기: 살아있음→예외 / 삭제됨→복원 / 없음→INSERT (§7.4)
  - `findByMemberIdAndGameId`에 소프트 삭제 조건 정리 (삭제된 행도 찾아야 revive 가능)
- [ ] A-6. 단건·목록 조회 (FR-QRY-05 기초, `deletedAt IS NULL` 조건)
- [ ] A-7. 마스터 이름 수정 시 전파 — `Game.name` 변경 → 해당 게임을 담은 **모든** 항목의 `displayName` 갱신 (§7.2, 서비스만. 관리자 인증은 Phase 3)

### 슬라이스 B — Playthrough와 상태 파생 ★ Phase 1의 알맹이

- [ ] B-1. 회차 추가 (FR-PT-01) — 회차 번호 1부터 순차, 시작일/종료일 (FR-PT-02)
- [ ] B-2. 회차 속성 — 기기 (FR-PT-03, BR-PT-05: 마스터 전체에서 선택), 에뮬레이터, 계정 (FR-PT-04), 입력 방식 (FR-PT-05), 라벨 (FR-PT-06, DLC는 본편의 추가 회차), 상태 (FR-PT-07)
- [ ] B-3. 검증 규칙 — 엔티티(01·04·06) / 서비스(02·03)
  - BR-PT-01: 종료일 ≥ 시작일
  - BR-PT-02: 기간 겹침 금지 (종료일 없는 회차는 무한대까지 점유)
  - BR-PT-03: **종료일 없는** 회차 1개만 (동시성 미보장 감수 — §7.4)
  - BR-PT-04: 당일 완료 유효
  - BR-PT-06: 상태↔종료일 짝 — `PLAYING` 열림 / `PAUSED` 자유 / `DROPPED`·`COMPLETED` 닫힘 (v1.5 신설)
- [ ] B-4. `BacklogEntry.syncDerivedState()` (§7.6) — 엔티티 메서드
  - 최신 회차 = `COALESCE(종료일, 시작일)` 최대 (날짜 기준, 번호 아님)
  - 회차 0개 분기 포함, `lastPlayedOn`·`lastPlaythrough` 갱신
- [ ] B-5. 회차 수정·물리 삭제 + 재동기화 — sequenceNo **구멍 허용으로 확정** (재부여 안 함)
- [ ] B-6. 테스트 — 상태 파생 전 분기 (과거 회차 늦게 추가해도 상태 안 뒤집히는지 포함)

### 슬라이스 C — Acquisition과 상태 완성

- [ ] C-1. 취득 추가 (FR-ACQ-01) — 방식 enum 7종, 계정 (FR-ACQ-02), 금액+통화 (FR-ACQ-03, Money·ISO 4217·KRW/USD/JPY), 라벨, 실물은 platform/account null
- [ ] C-2. 복수 취득 (FR-ACQ-06) — 재구매·DLC 별도 행
- [ ] C-3. 취득 반영 상태 재계산 — §7.6 완성: 회차 없음 + `NOT_OWNED` → `WISHLIST` / 그 외 취득 → `BACKLOG`
  - **결정 반영**: 담기 직후 기본 `WISHLIST`, 취득 강제 여부는 여기서 확정
- [ ] C-4. 취득 수정·물리 삭제 + 상태 재계산
- [ ] C-5. 테스트

### 슬라이스 D — Tag / Genre 사전

- [ ] D-1. 태그 붙이기 (FR-TAG-01) — 등록 절차 없음, 적으면 생성 (§6.7). `(member, name)` 중복 시 기존 재사용
- [ ] D-2. 자동 소멸 — **사전 행을 지우지 않고 조회에서 거른다** (§6.7 v1.5 개정). COUNT → DELETE는 경쟁 상태 때문에 폐기
- [ ] D-3. 태그 이름 변경·삭제 (FR-TAG-02)
- [ ] D-4. 개인 장르 동일 메커니즘 (FR-TAG-05) + 표시·집계 폴백 규칙 (개인 장르 있으면 개인, 없으면 마스터)
- [ ] D-5. 테스트 — 공유 태그의 소멸 타이밍 (한 항목에서 떼도 다른 항목에 남아있으면 유지)

### 슬라이스 E — PlatformAccount / MemberDevice

- [ ] E-1. 플랫폼 계정 등록·수정 (FR-PLT-01) — 동일 플랫폼 복수 계정 (FR-PLT-02)
- [ ] E-2. 계정 소프트 삭제 + 되살리기 (§6.5, §7.4) — 회차·취득이 참조하므로 보존
- [ ] E-3. 보유 기기 등록 (FR-PLT-03) — label·memo 포함, 물리 삭제
- [ ] E-4. 프로필 수정 — 닉네임, 프로필 메모 (FR-AUTH-11의 데이터 부분만. 인증은 Phase 3)
- [ ] E-5. 테스트

### 슬라이스 F — Subscription

- [ ] F-1. 구독 CRUD (FR-ACQ-04) — 서비스명 문자열(OI-06), 기간, 요금, 결제 주기. 물리 삭제
- [ ] F-2. 취득 ↔ 구독 연결 (FR-ACQ-05) — 방식이 `SUBSCRIPTION`일 때
- [ ] F-3. 테스트

### 슬라이스 G — 변경 이력 (SHOULD — 미루기 가능)

- [ ] G-1. 스냅샷 기록 (§7.5) — `BacklogEntry`·`Playthrough` 한정, 변경 시 JSON 저장, 연관은 ID만
- [ ] G-2. 이력 조회 (FR-BL-09 전반)
- [ ] G-3. 복원 시도 (FR-BL-09) — 검증 통과 시에만 커밋, 참조 소멸 시 실패, 복원 후 비정규화 재계산
- [ ] G-4. 테스트

---

## Phase 2 — 웹 계층과 DTO

> **순서 변경 (v1.5)**: H-5(예외)를 Controller보다 **먼저** 한다. 나중에 하면 응답 형식이 컨트롤러마다 제각각으로 굳는다.
> 화면 구성·API 방향은 스펙 §13에 확정돼 있다 (읽기=화면 단위 / 쓰기=리소스 단위).

- [ ] H-0. 화면 → API 역산 — URL·메서드·상태코드 (`docs/api-design-v0.1.md` 작성)
- [ ] H-5. 글로벌 예외 처리 (FR-SYS-03) — `@RestControllerAdvice`, `RevivableException` → 409, 유니크 위반 → 409
- [ ] H-1. DTO 설계 원칙 확립 — 엔티티 미노출, 트랜잭션 안에서 변환 (§6.8)
  - **결정 지점**: 도메인 Command record를 웹 Request DTO로 그대로 쓸지, 따로 둘지
- [ ] H-2. 백로그 목록·상세 조회 전용 서비스 + Controller
  - 목록 카드: 커버·이름·장르·평점·마지막 회차(번호/기간/기기)
  - **3방 이내로 끝내기** — ToOne join fetch + 장르 batch size
- [ ] H-3. 쓰기 Controller — 개인기록/오버라이드/회차/취득/태그·장르 (리소스 단위)
- [ ] H-4. 프로필·설정 Controller — 계정/기기/구독 + 태그별 항목 수 집계
- [ ] H-6. 입력값 서버 재검증 (Bean Validation)
- [ ] H-7. (선택) 최소 프론트 맛보기 — CORS 한 번 겪기
  - **반드시 클라이언트 컴포넌트에서 호출할 것.** 서버 컴포넌트는 서버→서버라 CORS를 우회한다

---

## Phase 3 — 인증/인가

> **순서 변경 (착수 시 결정)**: I-6(구글 연동)을 **맨 뒤로** 뺀다. SHOULD인 데다 구글 클라우드 콘솔 설정이라는
> 외부 작업이 끼어 세션 로그인 학습 흐름이 끊긴다. 번호는 참조 때문에 그대로 두고 순서만 바꾼다.
>
> **헤더 이행 (착수 시 결정)**: `X-Member-Id`는 I-3 이후 **dev 프로필에서만** 살려둔다.
> 운영은 세션만. 프론트 껍데기와 기존 테스트가 한 번에 죽지 않게 하려는 것.

- [ ] I-1. Spring Security 도입 (+`-test` 짝) — 필터 체인 이해
  - **목표는 "잠그기"가 아니라 "다 열어두고 초록불 유지"다.** 의존성만 넣어도 전 경로가 잠겨 기존 테스트가 무너진다
- [ ] I-2. 가입 (FR-AUTH-01) + 비밀번호 해싱 (AUTH-P3, **OI-03 결정**: BCrypt/Argon2id)
- [ ] I-3. 폼 로그인·세션 (FR-AUTH-03), 로그아웃 (FR-AUTH-04) ★ Phase 3의 알맹이
  - `LoginMemberArgumentResolver` 구현 교체 — 컨트롤러 시그니처는 그대로 산다
  - 소유권 검증(NFR-S7)이 실제로 걸리는지 테스트. 남의 `entryId`로 접근해보기
  - `X-Member-Id` 폴백을 dev 프로필로 격리
- [x] ~~**I-3T. 인증 흐름 테스트 보완**~~ → 완료. `e2e/AuthEndToEndTest` (RANDOM_PORT + 쿠키 저장소)
  - **왜**: I-3에서 "로그인 직후 모든 쓰기가 403"인 버그가 났는데 테스트 162개가 전부 초록불이었다.
    커버리지 부족이 아니라 **MockMvc가 보는 범위**의 문제다. `.with(csrf())` 헬퍼는 토큰 저장소를
    통째로 갈아치우고 유효한 토큰을 주입한다 — "클라이언트가 토큰을 어디서 얻는가"를 건너뛴다
  - **못 보는 것 일반화**: 쿠키 저장·덮어쓰기, 토큰 회전, 리다이렉트 추종, `SameSite`, CORS 프리플라이트.
    즉 **요청과 요청 사이에 브라우저가 하는 일**은 MockMvc에 없다
  - 보완 방향: `@SpringBootTest(webEnvironment = RANDOM_PORT)` + `RestClient`로 쿠키 저장소를 들고
    왕복하는 종단 테스트 한 벌 (가입 → 로그인 → 쓰기 → 로그아웃 → 재로그인)
  - 지금은 `CsrfTest` 하나가 쿠키 왕복을 흉내내지만 `@DirtiesContext`가 필요할 만큼 취약하다
- [ ] I-11. CSRF 전략 (**OI-14 결정**) — I-3에 붙여서 **로컬 기준으로만** 결론.
  크로스 도메인(`vercel.app` ↔ `onrender.com`, `SameSite=None`)은 Phase 9에서 재검토
- [x] I-4. 이메일 인증 (FR-AUTH-02) — 토큰 랜덤/만료/1회용/해시 저장, 재발송 + 스로틀 (NFR-S9).
      **OI-02 해소 (2026-08-25) — Resend.** SMTP가 아니라 HTTP API라 배포처가 25/587
      아웃바운드를 막아도 나간다. `app.mail.api-key`가 있으면 Resend, 없으면 콘솔 폴백 —
      프로필이 아니라 **설정값으로** 가른다 (자격증명 없는 CI도 그대로 떠야 하므로).
      ⚠️ `onboarding@resend.dev`는 **계정 소유자 주소로만** 발송된다. 남에게 보내려면 도메인 등록 필요.
      **발송 실패를 던지지 않는다** — 던졌더니 메일이 가입 트랜잭션 안이라 회원 생성까지 롤백돼
      다른 이메일로는 가입 자체가 막혔다. 실패 시 로그에 수동 링크를 남긴다
- [ ] I-5. 비밀번호 재설정 (FR-AUTH-05) — 계정 존재 비노출, 성공 시 전 세션 무효화
- [ ] I-12. 만료 토큰 정리 배치
- [ ] I-7. 탈퇴 유예 (FR-AUTH-09~10) — 소프트 삭제, 유예 중 **인증 통과·인가 제한**, BR-AUTH-02(이메일 재사용 불가)
- [ ] I-8. 유예 만료 배치 물리 삭제 (FR-SYS-06) — `@Scheduled`
- [ ] I-9. 관리자 (**OI-07 결정**: 계정 생성 방법) — 마스터 수정 권한 연결 (FR-ADM-01, A-7 재사용), 회원 목록 (FR-ADM-03)
- [ ] I-10. 감사 로그 (FR-ADM-05) — 조회 포함 기록, **OI-08 결정**: 보존 기간
- [ ] I-6. Google OAuth (FR-AUTH-06~08) — 로그인 상태 연결만, BR-AUTH-01(로그인 수단 소멸 방지) ← 맨 뒤로 이동
  - **코드는 완료. 실제 왕복은 구글 자격증명을 넣고 수동 확인해야 한다** (자동 테스트로 못 덮는 구간)
  - 자격증명이 없으면 oauth2Login이 체인에 안 붙는다 → 로컬·CI는 그대로 돈다

> **Phase 3 진행 상황 (I-6 제외 전부 구현)**
>
> 반복해서 밟은 함정 하나를 남긴다 — **CSRF 토큰이 폐기되는 순간마다 새로 발급해줘야 한다.**
> 로그인 성공 / 로그아웃 / 세션 강제 만료 세 곳에서 같은 버그를 세 번 만났고,
> 세 번 다 테스트는 초록불이었으며 실제로 앱을 띄워 curl로 눌러본 뒤에야 드러났다.
> 지금은 `CsrfTokenIssuer` 한 곳으로 모아뒀지만, 새로 끊고 나가는 응답을 만들 때마다 재발할 수 있다.
> → I-3T(종단 테스트)가 이 계열을 통째로 막는다. 미루지 말 것.
>
> 남은 구멍: 감사 로그에 **응답 상태 코드가 없다**(시도/성공 구분이 약함).
> 컬럼 추가는 스키마 변경이라 승인 후 진행.

---

## Phase 4 — RAWG 연동

- [x] J-1. RestClient 도입 + API 키 관리 (환경변수)
  - `spring-boot-starter-restclient` 추가 — 부트 4에서 HTTP 클라이언트가 모듈로 분리돼 `starter-webmvc`만으론 `RestClient.Builder` 빈이 없다
  - `RawgClient` 포트 + `HttpRawgClient` 구현. 테스트는 `FakeRawgClient`(포트) / `MockRestServiceServer`(구현)
  - **타임아웃 필수** — 기본값이 무한 대기라 RAWG가 멈추면 우리 스레드가 같이 멈춘다
- [x] J-2. 게임 검색 (FR-GAME-01) — 로컬 `MANUAL` + RAWG 결과. `externalId` IN 조회로 한 방에 매핑(건별 조회는 N+1)
- [x] J-3. 온디맨드 캐시 (FR-GAME-02, 03) — 마스터에 있으면 API 0회, 없으면 상세 호출 후 저장. `(source, externalId)` 유니크
  - 마스터에 `averagePlaytimeHours` 저장 (RAWG `playtime`). 오버라이드 없음, 상세 응답의 `master`에만 실린다
  - `GameResolver`(트랜잭션 밖, 외부 호출) ↔ `GameCacheService`(트랜잭션 안, DB만) 2빈 분리
  - 동시 저장은 유니크 제약이 잡고 → 재조회해서 상대가 넣은 행을 쓴다
- [x] J-4. 수동 등록 (FR-GAME-04) — 등록 후 수정은 관리자만 (AUTH-P2). `POST /api/games`
- [x] J-5. 재동기화 (FR-GAME-05, COULD) — 오버라이드 비영향. `POST /api/admin/games/{id}/resync`
  - `listPrice`를 안 건드리는 게 핵심 (RAWG는 가격을 안 준다)
  - 엔티티 변경 → 벌크 순서 고정. 벌크의 `clearAutomatically`가 엔티티를 준영속으로 만든다
- [x] J-6. 장애 처리 (FR-SYS-04) — 실패 알리고 취소, 부분 저장 금지. `ExternalApiException` → 502

### J-7 — RAWG → IGDB 전환

> 근거·실측 데이터는 `docs/igdb-survey.md`. RAWG는 API가 살아있지만 **가입·로그인이 깨져 키 재발급이 불가능**해서 옮긴다.

- [x] J-7-1. 스펙 개정 — `averagePlaytimeHours` → `timeToBeatHours` (의미 변경), 마스터에 `coverImageId` 신설, RAWG 출처 표기 조항 제거
- [x] J-7-2. 포트 중립화 — `RawgClient` → `GameCatalogClient` 등. `GameSource`에서 `RAWG` 빼고 `IGDB` 추가
- [x] J-7-3. 토큰 관리 — Twitch client_credentials, 64일 만료. 캐시 + 만료 전 갱신 + **401 시 강제 재발급 후 1회 재시도**
- [x] J-7-4. `HttpIgdbClient` — APIcalypse 본문, POST, `Client-ID`/`Bearer` 헤더. 검색은 가벼운 필드 세트, 담기는 `multiquery`로 `games` + `game_time_to_beats` 1회
- [x] J-7-5. 검색 필터 — `where version_parent = null & game_type = (0,3,4,8,9,10,11)`. **`version_parent`만으로는 모드가 안 걸러진다** (실측)
- [x] J-7-6. 변환 — Unix 초 → `LocalDate`(UTC), `normally` 초 → 시간. **`first_release_date == null` → `releasedOn = null`** (`game_status`는 신뢰 불가)
- [x] J-7-7. 커버 폴백 — 개인 업로드가 없을 때 IGDB 커버. §6.9 소유 모델은 유지, FR-MED-02의 기본값만 바뀜
- [x] J-7-8. RAWG 구현 제거 — 코드·설정·문서. 이력은 직전 커밋에 남는다

**검증** — 테스트 281개 초록불 + **실제 IGDB로 전 구간 왕복 확인**:
검색(로컬 캐시 매핑 포함) / externalId로 담기(상세 1회) / 재담기 409(외부 호출 0회) /
없는 id 404 / 재동기화 200(`reorderedEntries: 1`) / 수동 등록 게임 재동기화 400.

**남은 위험** — 초당 4회 / 동시 8건 제한. 지금 패턴(검색 1·담기 1)은 안 걸리지만
**Phase 7 임포트에서 파일 수십~수백 개를 매칭할 때 반드시 걸린다.**
J-7에서는 호출 간 최소 간격만 두고, 본격적인 스로틀링·백오프·429 처리는 **M-3에서 한다.**

---

## Phase 5 — 커버 이미지

- [x] K-1. **OI-01 결정: Cloudflare R2.** egress 무료가 이미지 서빙에 결정적이고 S3 호환이라 AWS SDK를 그대로 쓴다
  - 구현체 이름은 `S3CompatibleFileStorage` — 프로토콜이 S3고 R2는 그 구현 중 하나다. MinIO 로컬 검증에도 같은 클래스가 돈다
- [x] K-2. presigned URL 발급 (FR-MED-01) — 파일은 브라우저→스토리지 직접
  - `FileStoragePort` 포트 + `S3CompatibleFileStorage` / `UnconfiguredFileStorage`(자격증명 없을 때)
  - 2단계 흐름: 허가증 발급 → 브라우저 PUT → 확정. 서버는 업로드 성공 여부를 모른다
  - `CoverImageService`(트랜잭션 없음, 스토리지) ↔ `CoverRecordService`(트랜잭션, DB) 2빈 분리
- [x] K-3. 검증 — 확장자·MIME·용량, 위장 파일 차단
  - 세 겹: 발급 화이트리스트 / **Content-Type·Length를 서명에 포함** / 확정 시 앞 12바이트 매직 넘버
  - `storageKey` prefix 검사로 **남의 경로 파일 확정 차단**
- [x] K-4. 교체·삭제 + 스토리지 파일 정리 (FR-MED-03)
  - **DB 커밋 → 스토리지 삭제 순서.** 뒤집으면 DB엔 있는데 파일이 없는 상태가 생긴다
- [x] K-5. 기본 이미지 폴백 (FR-MED-02)
  - 응답에 `coverUrl`(개인) + `coverImageId`(마스터) **둘 다** 내린다. 서버가 합치면 마스터 커버 크기가 고정된다
  - 목록은 `findByBacklogEntryIdIn`으로 페이지 단위 한 방 (N+1 차단)

**검증** — 테스트 302개 초록불 (K 관련 21개 신설). **실제 R2 왕복은 미검증** — 자격증명이 없어도
전 구간이 가짜 포트로 돌아간다. Docker로 MinIO를 띄우거나 R2를 등록하면 코드 변경 없이 실물 검증 가능.

---

## Phase 6 — 조회 성능과 통계

- [x] L-1. 검색 (FR-QRY-02) — `displayName` 대상. 필터 (FR-QRY-03) — 상태·태그·장르·기기·계정
  - **QueryDSL `io.github.openfeign.querydsl:7.0`** (원본 `com.querydsl`은 5.1.0에서 멈춤). Boot 4 / Hibernate 7 호환은 스파이크로 먼저 확인
  - ⚠️ 포크는 `sum()`을 `sumLong()`·`sumBigDecimal()`·`sumAggregate()`로 쪼갰다. 5.x 예제를 그대로 쓰면 컴파일이 안 된다
  - **필터 4종을 `exists` 서브쿼리로.** join은 행이 증폭되고, distinct로 덮으면 count가 틀어져 페이징이 깨진다
  - `BacklogEntryRepositoryImpl` — 이름이 `<인터페이스명>Impl`이어야 Spring Data가 붙인다
- [x] L-2. 정렬 (FR-QRY-04) — 기본 최근 플레이순, 2차 정렬 고정 (BR-QRY-01)
  - Phase 2에 이미 있었다. QueryDSL 전환 후에도 4종·2차·tie-break·nullsLast가 유지되는지 테스트로 고정
  - `BacklogSort`가 Spring `Sort`와 `OrderSpecifier`를 **한 enum 안에** 나란히 든다. 갈라지면 정렬이 조용히 달라진다
- [x] L-3. N+1 대응 (§6.8) — ToOne fetch join, 컬렉션 batch size
  - **실측: 목록 5방 / 상세 12방.** 항목·회차 수가 늘어도 안 는다. 필터를 걸어도 그대로(exists라 where 절)
  - `QueryCountTest`가 Hibernate 통계로 감시한다. 절대값이 아니라 **"비례하지 않는다"** 를 단언
  - 🐛 **여기서 실제 버그를 찾았다** — `Playthrough.overlaps`가 `other.startedOn`을 **필드로** 읽어
    `other`가 하이버네이트 프록시일 때 항상 null. `BacklogEntry.lastPlaythrough`가 LAZY라
    실제 앱에서 **2회차 추가가 매번 500**이었다. getter로 고치고 `em.clear()` 재현 테스트 2개 추가
- [x] L-4. 인덱스 검증 — 비정규화 컬럼 3종이 실제로 타는지 실행계획 확인
  - **H2는 우리 복합 인덱스를 정렬에 쓰지 않는다** (실측). 하이버네이트가 FK마다 자동 생성한
    `member_id` 단일 인덱스로 필터만 하고 정렬은 메모리에서 한다
  - **PostgreSQL은 FK에 인덱스를 자동 생성하지 않는다** → 그쪽에선 복합 인덱스가 유일한 후보다.
    실행계획 확인은 **Phase 9(O-2)에서 Neon으로** 다시 한다
  - `IndexDefinitionTest`는 계획이 아니라 **정의**를 지킨다 — `@Index`를 실수로 지우면 빨개진다
  - ⚠️ `CoverImage`의 명명된 unique는 무시됐다. `@OneToOne`이 스스로 만든 것과 중복 판정 (설계서 v0.3이 예고).
    **제약 자체는 걸려 있고** 이름만 자동 생성 — Phase 9 숙제
- [x] L-5. 통계 — 장르별 (FR-STAT-01), 기간별 완료 (FR-STAT-02), 플레이타임 (FR-STAT-03), 지출 2축 분리 (FR-STAT-04, BR-ACQ-01)
  - 엔드포인트 4개로 분리 (`/api/stats/{genres,completions,playtime,spending}`)
  - 장르별은 **쿼리 2방** — §6.7 폴백이 항목마다 분기라 `group by` 하나로 안 나온다
  - 완료는 **회차 기준** — 항목 상태로 세면 3회차까지 깬 게임이 1로 잡힌다
  - **통화를 합치지 않는다.** 환산은 환율이 필요해 범위 밖. 구독료 결제 횟수 규칙은 스펙에 없어 여기서 정함
- [x] L-6. (COULD) 기기·플랫폼·계정별 (FR-STAT-05), 상태별 (FR-STAT-06) — **건너뜀**
  - `GET /api/backlog/facets`가 **이미 상태별·기기별·계정별 count를 준다.** 다시 만들면 같은 숫자를 두 곳에서 관리하게 된다
  - 신규 가치는 "플랫폼별"(계정이 아닌 Platform 단위) 하나뿐이고, 완료율·중단율은 facets의 statuses로 화면이 계산할 수 있다
  - COULD 항목이라 여기서 멈춘다. 필요해지면 facets를 확장하는 쪽이 맞다

### L-11 — 스펙 대조 테스트 감사 (BR·FR 전수)

`docs/spec-v1.5.md`의 BR 16개 / FR MUST·SHOULD 전수를 테스트와 대조했다. 테스트 383개 (감사 전 356 → +27).

- [x] 🔒 **소유권 미검사 보류 해제** — v0.2가 "Phase 3에서 막아야 한다"고 적어둔 항목이
  Phase 3이 끝난 뒤에도 살아 있었다. 남의 `platformAccountId`를 회차·취득에 붙일 수 있었다 (NFR-S7).
  `platformAccountService.findOne`으로 막고 테스트 3개 추가 (남의 것 404 / 삭제된 내 것은 허용 / 없는 기기 404)
- [x] **BR-PT-02 무한대 점유** — v1.5 신설 조항인데 테스트 0건이었다.
  진행 중 회차는 시작일부터 무한대를 점유하는데 그 경로를 타는 테스트가 없어,
  `occupiedUntil()`의 `LocalDate.MAX`를 `startedOn`으로 바꿔도 전부 통과했다. 경계 4건 추가
- [x] **BR-PT-06 닫힌 상태의 종료일** — 불변식 절반(`mustBeClosed`)이 미검증이었다.
  항상 false를 반환해도 통과했다. 상태 4종 × 2메서드 규칙표를 통째로 고정
- [x] **BR-QRY-01 2차 정렬** — 1차 키가 동점인 데이터가 하나도 없어 `SECONDARY`를 지워도 통과했다
- [x] **FR-QRY-03/04 필터·정렬 절반** — `genreId`·`platformAccountId` 필터, `rating`·`releasedOn` 정렬이 0건이었다
- [x] BR-PT-05 — 보유하지 않은 기기 지정이 우연히 통과하던 것을 의도로 고정

**변이 테스트로 검증했다.** 로직을 일부러 망가뜨려 테스트가 잡는지 확인:

| 변이 | 결과 |
|---|---|
| `mustBeClosed()` → 항상 false | 3개 잡음 ✅ |
| `occupiedUntil()` MAX → startedOn | 처음엔 **0개** → 경로를 잘못 짚은 걸 알고 테스트 보강 |
| `BacklogSort` 2차 정렬 제거 | 1개 잡음 ✅ |
| `BacklogSort` tie-break 제거 | 처음엔 **0개** — H2가 우연히 안정적인 순서를 줬다 |

**tie-break는 DB 동작으로 검증할 수 없다.** 순서가 우연히 맞을 수 있어서다.
`BacklogSortTest`를 만들어 **order by 절의 계약**(단계 수·컬럼·방향·nullsLast)을 직접 단언했고,
그러자 tie-break 제거가 3개 테스트에 잡혔다.

> **남은 것** — FR-BL-09(변경 이력 조회·되돌리기, SHOULD)는 `EntitySnapshot` 엔티티만 있고
> 기록·조회·복원 경로가 전혀 없다. 감사가 찾은 **미구현 요구사항**이며 별도 슬라이스가 필요하다.

---

### L-7~L-10 — 상세 화면 데이터 확장 (화면 요구에서 역산)

- [x] L-7. `Game` 마스터를 IGDB 미러로 확장 (9필드 → 20필드)
  - 배너·소개·스토리라인·유저 평점(+표본)·출시 플랫폼·클리어 소요 3종(+표본)
  - `timeToBeatHours` → `mainStory/mainExtra/completionist` 3개로 분리. **v1.6에서 개명한 자리를 또 고친 것**이라 이력을 문서에 남김
  - 인자가 16개라 `CatalogSyncCommand`로 묶음 — 평평하게 넘기면 `Integer` 5개가 나란히 붙어 순서를 바꿔도 컴파일이 통과한다
  - 🐛 **`summary`/`storyline`을 varchar(2000)으로 잡았다가 실측으로 잡았다.** IGDB 2,000건을 훑으니
    summary 최대 3,254자, **storyline 최대 20,764자**. LONGTEXT로 바꾸고 2만 1천 자 삽입까지 테스트로 고정
  - ⚠️ `releasePlatforms`(PS5·Switch)는 `Platform` 엔티티(Steam·PSN)와 **다른 개념**. 이름을 갈랐다
- [x] L-8. 상세 응답 확장 + **커버를 `resolved`로 통합**
  - 그전엔 장르는 서버가 합성하는데 커버만 화면이 합성하는 비대칭이 있었다
  - `resolved.cover.source`(PERSONAL/MASTER/NONE)로 승자를 알려주고 **크기 선택만 화면 몫**
  - `createdAt`(담은 날짜) 추가 — 상세 타임라인의 기점. 나머지 시점은 프론트가 계산
  - `listPrice`는 응답에서 제외 (자리만 두고 출력 안 함)
- [x] L-9. 대시보드 지원
  - `BacklogSort`에 `playtime` 추가 — 나머지 타일은 **기존 목록 API를 size로 자르면 된다**
  - `GET /api/stats/spending/monthly` — 구독료를 월별로 펼치고(연간은 결제월에만), 연도별 월평균 분모는 **12개월 고정**
- [x] L-10. 문서 개정 — §6.2 마스터 필드 전면 재작성, §7.1 "오버라이드 규칙" → **"표시값 규칙"**(7개 통일), §8.1에 ITAD 범위 밖 명시, FR-STAT-07 신설

**검증** — 테스트 356개 초록불. **앱을 띄워 전 구간 실왕복 확인:**
IGDB 검색 → `externalId`로 담기 → 상세에 마스터 20필드 전부 실데이터로 채워짐(Witcher 3: 배너 `ar3lze`,
평점 93.79/표본 5427, 플랫폼 6종, 클리어 37/71/162h) → `resolved.cover.source = MASTER` →
playtime 정렬 → 월별 지출(2026-03이 취득 29,800 + 구독 16,700 = 46,500으로 합산, 연평균 분모 12개월) →
통계 4종 → 재동기화 200 → 필터 조합.

🐛 **왕복에서 버그를 하나 더 잡았다** — 커버 업로드가 실패할 때 **"게임 정보 서비스에 연결하지 못했습니다"** 가
나갔다. 외부 의존이 둘(게임 DB·이미지 저장소)인데 `ExternalApiException`을 공유하면서
전역 핸들러가 메시지를 하나로 뭉갠 것. `Service` enum을 들려 보내 갈랐고, 재기동해 실제 응답으로 확인했다.
**테스트만으로는 안 드러났다** — 응답이 200/502로는 맞았기 때문이다.

이전 상태 —
QueryDSL 경로는 기존 목록 테스트가 전부 통과하며 회귀를 막았고, 통계는 신규라 컨트롤러 테스트로 덮었다.

---

## Phase 7 — Obsidian 임포트 ★ 졸업선 → **기능 미구현으로 종결 (2026-08-24)**

임포트 기능(FR-IMP-01~03)을 만들지 않기로 결정. 대신 일회성 러너(VaultLoader, 투입 후 삭제됨)로
vault 76건을 Neon에 직접 투입했다. IGDB 한글 매칭 문제(77건 중 76건 한글 제목)가 사라지고
레이트리밋·건별 트랜잭션 설계도 러너 안에서 소화됐다. **리뷰 시 "임포트 미구현"은 결함이 아니라 결정이다.**

- ~~M-1~M-6~~ 기능 종결로 불필요
- [x] M-7. 실데이터 투입 — 76건 (COMPLETED 39·BACKLOG 25·PAUSED 8·PLAYING 4, 회차 63·취득 76·장르 38종).
      파생 상태 §7.6·회차 규칙 BR-PT가 실데이터에서 검증됨. 도중 잡힌 것: IGDB가 번들·시즌패스를
      물어오는 문제(이름 정확 일치 1순위로 해소)

---

## Phase 8 — 프론트엔드 (보너스)

- [x] N-1. Next.js 프로젝트 + 화면 설계 (**OI-11**) — **골격까지 완료 (2026-08-24)**.
      목업(5,239줄)을 걷어내고 라우트 그룹 `(public)`/`(app)` + 스텁 14개만 남겼다.
      화면 구성은 `docs/frontend-brief.md`(디자인용), API·함정은 `docs/frontend-impl-notes.md`.
      디자인 시안 수령 후 N-3 착수.
      확정: ① 정적 export 안 씀(데이터는 전부 클라이언트에서) ② 상세는 `/library/[entryId]` 별도 라우트
      ③ 프로필+설정을 `/settings` 하나로 합침
- [x] N-2. CORS/쿠키 크로스 도메인 처리 — **완료 (2026-08-25)**. `CorsConfig` + 시큐리티 체인에 `.cors()`,
      OPTIONS permitAll. `allowCredentials=true`라 와일드카드 불가 → `app.cors.allowed-origins` 명시 목록
- [x] N-2b. `src/lib/api.ts` — fetch 래퍼 + `credentials: 'include'` + CSRF 헤더 + 에러 코드 분기. **완료**
- [x] N-2c. 사이드바 전용 `GET /api/backlog/names` 신설 (전 항목 이름순, 페이징 없음)
- [ ] N-3. 주요 화면 — **입구·대시보드·라이브러리·상세 완료 (2026-08-25)**.
      Tailwind v4 + `docs/design-system.md` 신설. 유체 WebGL 배경, 공통 컴포넌트 12종.
      **상세 편집 완료 (2026-08-25)** — 개인기록·오버라이드·태그·장르·회차·취득·커버·삭제 8경로.
      **전 화면 완료 (2026-08-25)** — 로그인·회원가입·이메일 인증·비밀번호 재설정 2종·계정 복구·
      담기(IGDB 검색 + 되살리기 + 수동 등록)·설정 6섹션·관리자(회원/감사 로그).
      정가 통화 UX (**OI-12**)는 정가를 화면에 안 내보내기로 해서(§8.1) 대상이 없다

  ⚠️ **H2 버전 고정 (2026-08-25)** — 부트 BOM의 2.4.240에서 `insert ... values (..., default)` 형태에
  check 제약이 잘못 걸려 회차 추가가 전부 409로 막혔다 (UPDATE는 정상). `2.3.232`로 핀.
  dev의 H2 TCP 서버도 2.3.232라 드라이버를 맞춰야 한다 — O-1에서 겪은 불일치와 같은 계열

---

> ⚠️ **`GoogleLinkSessionFilter`는 `OAuth2AuthorizationRequestRedirectFilter`보다 앞에 등록한다.**
> 뒤에 두면 리다이렉트 필터가 먼저 체인을 끝내 **아예 실행되지 않는다** —
> 연결 시도가 조용히 로그인/가입으로 처리돼 "이미 가입된 이메일"로 튕기고 로그아웃된다.
> 실행 여부는 `구글 연결 시작 — memberId=` 로그로 확인한다 (2026-08-25 수정).

## Phase 9 — 배포 (보너스)

- [x] O-1. Flyway 전환 — `V1__init.sql` 작성, `ddl-auto: validate` (NFR-O2). Phase 7 선행 조건이라 앞당김.
      dev H2는 `MODE=PostgreSQL`, 일반 테스트는 `create` 유지 + FlywayMigrationTest가 드리프트 감시.
      H2 TCP 서버 1.4.200 → 2.3.232 교체 (드라이버와 버전 불일치로 Flyway 메타데이터 조회가 깨졌음)
- [ ] O-2. 설계서 §9 체크리스트 — 부분 유니크 인덱스 재검토 (BR-PT-03), 실제 PostgreSQL에서 실행계획·FK 인덱스 재확인.
      V1에서 선반영: TEXT 동작 (OI-15, summary/storyline text 교정), FK 이름 (OI-16), enum check 명시, FK 컬럼 인덱스
- [ ] O-3. Neon/Render/Vercel 배포 + 환경변수 — **Neon 완료 (2026-08-24)**,
      **R2 커버 업로드 3단계 왕복 검증 완료 (2026-08-25)** — presigned URL → 직접 PUT → 확정.
      ⚠️ presigned 서명에 `content-length`가 들어간다: 신고한 `sizeBytes`와 실제 파일 크기가
      다르면 R2가 `SignatureDoesNotMatch`로 403을 준다: PostgreSQL 17.11 싱가포르,
      V1 적용 + 실데이터 76건 투입, prod 프로필·PostgreSQL 드라이버·flyway-database-postgresql 추가됨.
      Render/Vercel 남음. ~~LoggingAuthMailSender prod 개방~~ → I-4에서 Resend로 해소됨
- [ ] O-4. Spring Session + JDBC (재시작 대비)
- [ ] O-5. HikariCP 튜닝 (DB idle sleep 대응)

---

## Phase 10 — 선택 (보너스)

- [ ] P-1. 스크린샷/영상 (FR-MED-04)
- [ ] P-2. 환율 변환 배치 (**OI-04**) — 구매가는 스냅샷, 정가만 실시간 (§7.7)
- [x] ~~P-3. 관리자 고도화 — 마스터 병합 (FR-ADM-02), 플랫폼·기기 마스터 관리 (FR-ADM-04)~~
  → **Phase 3에서 선행 구현** (I-9 관리자와 같은 경로·같은 인가 규칙이라 나눌 이유가 없었다).
  관리자 화면(`/admin`)만 Phase 8에 남는다

---

## 페이즈 무관 상시 원칙

- 엔티티를 만지면 DDL 확인
- SQL 로그 켜둔 채 개발, 테스트마다 쿼리 개수 확인
- 구조에 영향 주는 결정은 제안 → 승인 → 실행
- OI 결정 시점이 오면 그 자리에서 확정하고 스펙에 기록
