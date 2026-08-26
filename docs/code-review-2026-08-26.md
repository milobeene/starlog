# 코드 리뷰 결과와 조치 (2026-08-26)

멀티에이전트 리뷰 **62 에이전트**(1차 40 + 이어받기 22). 확정 21건, 기각 5건.
관점 5개(JPA·인가/소유권·스키마 정합·트랜잭션/동시성·API 계약) + 렌즈 분산 검증 + 완결성 스윕.

## 리뷰 설계에서 배운 것

**1. "합의"가 아니라 "재현"을 요구해야 한다.**
검증자에게 다수결을 시키면 모델이 공통으로 못 보는 결함은 3인이든 5인이든 똑같이 놓친다.
그래서 검증자 둘에게 **서로 다른 임무**를 줬다 — ① 실패 경로를 직접 재구성, ② 스펙·프론트와 모순 검사.
재현에 실패하면 CONFIRMED가 아니라 PLAUSIBLE로 강등. 실제로 이 규칙이 5건을 걸러냈다.

**2. 검증기 실패를 기각과 구분해야 한다.**
1차 스크립트가 `검증기 null → REJECTED`로 처리해서, 세션 한도로 죽은 검증기의 발견 3건이
**조용히 기각**됐다. 재검증하니 2건이 실제 결함이었다. 이어받기 스크립트는 `UNVERIFIED`로 분리한다.

**3. 완결성 비평가가 제일 값졌다.**
관점 5개의 **경계 사이로 빠지는 영역**이 실재했다. 비평가가 지목한 3곳(배치/스케줄러,
커버 업로드 오케스트레이션, 테스트 계층 자체)에서 HIGH 4건이 나왔다 — 파인더 5명이 전부 놓친 곳이다.

## 고친 것

### 인증·세션
| 위치 | 문제 | 조치 |
|---|---|---|
| `GoogleOAuth2SuccessHandler` | **구글 세션이 무효화에서 통째로 누락.** 시큐리티 필터가 성공 핸들러 전에 OAuth2 principal로 레지스트리에 등록하는데, 핸들러는 SecurityContext만 갈아끼워 `instanceof MemberPrincipal` 필터에 안 걸렸다. 탈퇴해도 세션이 30일 내내 살아있었고 v1.9는 구글 전용이라 **사실상 전 세션** | `reregisterSession`으로 레지스트리 principal 교체 |
| 〃 | 거부 경로가 ThreadLocal만 비우고 HTTP 세션을 안 지워 "미승인은 세션이 안 생긴다"는 불변식이 깨짐 | `session.invalidate()` 추가 |
| 〃 | 탈퇴 유예 중에도 OAuth2 경로로 구글 연결이 가능 (FR-AUTH-10 우회) | `deletedAt` 검사 후 `WITHDRAWAL_PENDING` 리다이렉트 |

### 배치·트랜잭션
| 위치 | 문제 | 조치 |
|---|---|---|
| `WithdrawalService.purgeExpired` | **주석이 사실과 반대였다.** "@Transactional이 없어야 한다"고 적혔지만 클래스 레벨 `readOnly = true`가 걸려 있었다 → ① 커버 삭제가 커밋 **전**에 실행(K-4 위반) ② 벌크 DELETE가 readOnly 트랜잭션에 참여해 **PG에서 25006으로 매일 조용히 실패** | `Propagation.NEVER` — 바깥 트랜잭션이 있으면 터뜨려 회귀를 즉시 드러냄 |
| `MemberPurgeService` | 만료 회원 전원이 한 트랜잭션 → 한 명이 터지면 전원 롤백, 매일 같은 집합 재시도(**poison pill**) | 회원별 트랜잭션 + 실패 격리(자기 주입 프록시) |
| `EmailVerificationService`·`PasswordResetService` | Resend HTTP 호출이 트랜잭션 안 — 커넥션 점유 + 롤백 시 **죽은 링크 발송** | `AfterCommit` 유틸로 커밋 뒤 발송 |

### 커버 업로드
| 위치 | 문제 | 조치 |
|---|---|---|
| `CoverImageService.newStorageKey` | 발급은 **원문**, 검증은 **strip한** 이름에서 확장자를 뽑아 어긋남 → 파일명 끝 공백이면 **항상 400** + R2에 고아 객체 | 정규화된 이름에서 추출 |
| `CoverImageService.confirm` | 같은 키로 두 번 확정하면 **방금 붙인 실물을 삭제** (PUT은 멱등이라 프록시가 재시도) | 같은 키면 삭제 건너뜀 |

### 그 외
- `MeResponse.PlatformRef` — `{platformId,name}` → `{id,name}`. 프론트가 `edit.platform.id`를 읽는데 `undefined`였다 (**프론트가 정답** 원칙)
- `PlaythroughRepository` — `inputMethod` fetch join 누락 (JPA 원칙 4)
- `S3CompatibleFileStorage.delete` — `S3Exception`만 삼켜 네트워크 오류가 전파됐다. `SdkException`으로 넓힘 — "커밋 뒤 삭제는 안 던진다"는 계약 복구
- `PlaythroughService` — BR-PT-02·03 검증을 항목 행 비관적 락으로 직렬화

## 테스트 개선 (409 → 416)

**1. `FlywayMigrationTest`가 실제로 물게 했다.**
전에는 Hibernate validate뿐이라 **V1에서 유니크 16·check 7·FK 34를 전부 지워도 초록불**이었다.
validate는 (테이블, 컬럼, 타입)만 본다. 제약·인덱스 이름을 세는 단언을 추가했고,
**일부러 제약을 지워 빨간불이 나는 것까지 확인**했다.

**2. `IndexDefinitionTest` 삭제.**
`ddl-auto:create`가 만든 **엔티티 스키마**를 검사하고 있어 배포 스키마와 무관했다 — 구조적으로 무의미.
지키던 불변식(선두 컬럼 = member_id)은 `FlywayMigrationTest`로 옮겨 배포 스키마를 보게 했다.

**3. Testcontainers 부분 도입 — `PostgresSchemaTest`.**
나머지 400여 개는 H2로 그대로 돈다. **PG 전용 결함만** 덮는 게 목적이다.

효과를 실측했다: 오늘 고친 `:param is null or` 버그를 되돌리자
**H2 테스트는 전부 조용했고 `PostgresSchemaTest`만 빨간불**이었다. 정확히 오늘 새어나간 부류다.

> ⚠️ 전용 `org.testcontainers:postgresql` 모듈이 이 환경에서 해석되지 않아 코어의
> `GenericContainer`로 postgres 이미지를 직접 띄운다. 필요한 건 JDBC URL 하나뿐이라 손해가 없다.
> **도커가 없으면 이 클래스는 실패한다** — 도커 없이 돌리는 스위치는 다음 숙제.

**4. 커밋 시점 부수효과 검증 지원.**
`ControllerTestSupport.commitNow()` / `commitAndLeaveTransaction()` 추가.
`AfterCommit` 발송과 `Propagation.NEVER` 배치는 롤백되는 테스트 트랜잭션에서 검증할 수 없다.

**5. `SessionRegistry` 오염 차단.**
싱글턴이라 등록한 세션이 테스트 사이로 샌다. `@AfterEach` 정리 추가 (실제로 이 때문에 두 번 깨졌다).

## 안 고친 것 — 알려진 한계

| 항목 | 판단 |
|---|---|
| 재발송 스로틀 레이스 (`EmailVerificationService`) | 동시 요청으로 60초 스로틀 우회 가능. 1인 습작에서 도달 확률이 낮고, 막으려면 회원 행 잠금이 필요 |
| 플랫폼 삭제 ↔ 계정 등록 경합 | 삭제된 플랫폼에 살아있는 계정이 남을 수 있음. 위와 같은 이유로 문서화만 |
| 게임 병합 레이스 (`GameMergeService`) | 검증자가 **"CLAUDE.md 원칙 7의 2층 방어 그 자체"**라고 반박. 남는 알맹이는 에러 문구뿐 |
| 인덱스 33개 중 19개가 엔티티 미선언 | 배포 스키마의 주인은 V1이고 이제 `FlywayMigrationTest`가 지킨다. 엔티티 `@Index`는 테스트 스키마용이라 이중 관리 비용이 더 크다 |
| `Currency` 유니온 협소 | **기각** — 그 통화가 실제로 들어오는 경로가 제품에 없다 |
