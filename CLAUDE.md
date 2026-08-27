# STARLOG

게임 백로그 관리 서비스. Spring Boot REST API + Next.js. 개인 학습용 습작 프로젝트.

## 지금 어디쯤인가

**v0.1(웹) 완료 · `main`에 태그.** 지금은 `v1.0` 브랜치에서 **데스크탑 앱**을 만든다.
v1.0은 "내 앱을 데스크탑으로"가 아니라 **"각자 자기 인프라의 주인이 되는 프로그램"**이다 —
로그인 없음, DB·스토리지·IGDB 키를 사용자가 고른다. **`main`에 푸시 금지.**

## 참조 문서 (필요할 때 읽을 것, 미리 다 읽지 말 것)

- `docs/v1.0-architecture.md` — **⚠️ v1.0의 모든 설계 판단은 여기가 기준.** 여기부터 읽을 것
- `docs/v1.0-decisions.md` — 결정 이력과 남은 미결
- `docs/v1.0-plan.md` — 조사 결과와 함정 목록
- `docs/spec-v1.5.md` — 기능명세서. **v0.1의 기준.** 기능 자체는 v1.0에서도 유효
- `docs/entity-design-v1.0.md` — 엔티티 설계서 (Phase 9 전면 개정)
- `docs/db-baseline-v1.md` — 스키마 베이스라인 설계 근거. **DDL을 고치기 전에 읽을 것**
- `docs/code-review-2026-08-26.md`, `docs/code-review-2026-08-27.md` — 리뷰 결과·조치·알려진 한계
- `docs/capacity-planning.md` — 무료 티어 한도와 사용량 제한 설계 (v1.0에서 대부분 무효)
- `docs/api-design-v0.2.md` — API 설계서 (Phase 2). 화면에서 역산한 엔드포인트
- `docs/dto-design-v0.1.md` — DTO 설계 원칙 (H-1). 변환 위치·null 규약·검증 두 겹
- `docs/design-system.md` — **디자인 시스템 (Phase 8). 모든 화면이 이걸 따른다.** 색·타이포·공통 컴포넌트
- `docs/web-only-inventory.md` — 웹 전용 항목 전수 조사. 로컬 앱 전환 때 뗄 것 (전제 4회 개정)
- `docs/next-session-plan.md` — v0.1 작업 기록 (**닫힘**). 밟았던 함정 목록이 여기 있다
- `docs/phase8-handoff.md` — 진행 이력·함정·미결
- `docs/design-request.md` — **디자인 요청서**. 입구·대시보드·라이브러리 3화면의 확정 구성. 서비스명 **STARLOG**
- `docs/frontend-brief.md` — **화면 브리프 (Phase 8, 디자인용)**. 페이지별로 어떤 섹션이 들어가는지
- `docs/frontend-impl-notes.md` — 프론트 구현 메모. 화면별 API·함정
- `docs/dev-order.md` — v0.1 개발 순서 (**닫힘**). 슬라이스 A~P
- `docs/스프링_어플리케이션_개발시_체크리스트.md`

## 스택

- Spring Boot 4.1.0 / Java 21 / Gradle Groovy
- H2 (dev, TCP 서버 모드) / Neon PostgreSQL (prod)
- Spring Data JPA — `JpaRepository` 직접 상속 금지, `BaseRepository` 사용 (아래 JPA 12번)
- QueryDSL은 L-1(Phase 6)에서 도입. 그전까지 동적 쿼리 없음
- p6spy, Lombok, Spring Security(Phase 3), RestClient + RAWG API(Phase 4)
- 패키지: `com.milobeene.starlog`
- 프론트: Next.js 16 / React 19 / **Tailwind v4** / react-markdown. 서비스명 **STARLOG**
- 배포: Render(백엔드) / Vercel(프론트) / Neon(DB)

### Spring Boot 4 주의

- `spring-boot-starter-web` 아님 → `spring-boot-starter-webmvc`
- `starter-test`가 모듈별로 분리. 의존성 추가 시 `-test` 짝도 함께
- Hibernate 7.4.x, Jakarta EE 11, Jackson 3
- Spring Framework 7의 JSpecify 도입 → `@NullMarked` 경고 가능

## 구조

모노레포. `docs/`, `backend/`, `frontend/`(Phase 8).

패키지 바이 피처: `common/`(entity, config, exception, repository, util), `member/`, `game/`, `backlog/`, `tag/`, `platform/`, `subscription/`, `auth/`, `admin/`

## 설계 원칙 (확정 — 어기지 말 것)

### JPA

1. 모든 `~ToOne`에 `fetch = LAZY` **명시** (기본값이 EAGER)
2. `@Setter`/`@Data` 금지. 변경은 의미 있는 메서드로. `@ToString`은 `exclude` 필수
3. 엔티티를 API 응답으로 내보내지 않는다. DTO 변환은 트랜잭션 안에서 완료
4. N+1은 1순위 의심 대상. ToOne은 `join fetch`, 컬렉션은 지연 로딩 + batch size (컬렉션 페치 조인은 페이징 불가)
5. 변경 감지(dirty checking) 우선. `merge()` 금지
6. `@Transactional(readOnly = true)` 클래스 레벨 + 쓰기 메서드 개별 선언
7. DB 유니크 제약이 진짜 방어선. 애플리케이션 검증은 최선 노력일 뿐
8. `@ManyToMany` 금지. 조인 테이블은 엔티티로 승격
9. `open-in-view: false`
10. 엔티티 매핑을 바꾸면 DDL을 확인한다
11. `@Transactional`은 프록시 기반. 같은 객체 내 `this.메서드()` 호출은 트랜잭션이 안 걸린다 → 별도 빈으로 분리
12. 리포지토리는 `BaseRepository<T, ID>`를 상속한다. `JpaRepository` 금지 — `save()`가 준영속 엔티티에 `merge()`를 돌려 5번과 충돌한다. 신규는 `persist()`, 수정은 변경 감지, 벌크는 `@Modifying` + `@Query`
13. 벌크 연산은 영속성 컨텍스트를 우회한다 → `@Modifying(flushAutomatically = true, clearAutomatically = true)`, `updatedAt`은 SET 절에 직접 쓸 것 (`@LastModifiedDate` 콜백이 안 돈다)
14. 유니크 제약이 걸린 컬럼은 **검증을 변경보다 먼저**. 먼저 바꾸면 검증 쿼리의 자동 flush가 내 검증보다 DB 제약을 먼저 터뜨린다

### 일반

- 입력값은 백엔드에서 재검증. 서버는 클라이언트를 믿지 않는다
- 예외는 `@RestControllerAdvice`로 일관된 상태코드
- BigDecimal: `setScale` 후 범위 검증, 비교는 `compareTo` (`equals` 아님)
- String: `trim()` 대신 `strip()`, 빈 문자열은 null로 수렴

## 로컬 실행

```bash
# 백엔드 — local의 자격증명(IGDB·구글)만 쓰고 DB는 인메모리로. Neon을 안 건드린다
cd backend && ./gradlew bootRun --args="--spring.profiles.active=dev,local \
  --spring.datasource.url=jdbc:h2:mem:verify;DB_CLOSE_DELAY=-1;MODE=PostgreSQL \
  --spring.datasource.driver-class-name=org.h2.Driver \
  --spring.datasource.username=sa --spring.datasource.password="
```

`driver-class-name`까지 덮어야 한다 — `application-local.yml`이 PostgreSQL 드라이버를 지정한다.

dev 시드 계정: `milo.beene@gmail.com` (비밀번호 없음 — 로그인 자체가 없다)

**로그인이 없다 (v1.0 4단계).** 앱을 열면 바로 내 기록이다.

- 주인은 `OwnerService`가 정한다 — 회원이 없으면 만들고, 있으면 가장 먼저 만들어진 것
- `@LoginMember` 값은 전부 `LoginMemberArgumentResolver` 한 곳을 지난다. **여기가 이음매다**
- 프론트 개발 서버가 `/api`를 백엔드로 프록시한다 (CORS 없음 — `next.config.ts`)

⚠️ **`X-Member-Id` 헤더는 인증이 아니라 테스트 장치다.** dev·test 프로필에서만 읽히고
(`MemberIdOverride`), 컨트롤러 테스트가 "다른 회원인 척"해 소유권 검증을 지키는 데 쓴다.

## 데스크탑 앱 (v1.0)

```bash
./tools/build-desktop.sh          # 프론트 정적 빌드 → 백엔드 리소스 복사 → jar
cd desktop && npm install && npm start
```

일렉트론이 **빈 포트를 골라 jar를 띄우고** 그 주소를 창에 로드한다.
백엔드 로그는 `~/Library/Application Support/starlog-desktop/backend.log`.

⚠️ **프론트를 고쳤으면 `build-desktop.sh`를 다시 돌려야 한다** — jar 안에 정적 파일이 들어간다.
⚠️ 상세 화면 경로는 **`/library/detail?entry=57`**이다 (동적 경로는 정적 내보내기가 못 만든다).

## 프론트 ↔ 백엔드 계약 검사

프론트에는 테스트가 없어 DTO가 바뀌면 **조용히 어긋난다.** 실제로 네 번 겪었다.

```bash
python3 tools/contract-check.py
```

백엔드를 dev 프로필로 띄운 채 돌린다. 실제 JSON을 받아 `frontend/src/lib/types.ts`의
인터페이스와 키를 대조한다 — 정적 파싱이 아니라 응답 기준이라 Jackson 직렬화까지 잡힌다.
**백엔드 DTO를 만지면 이걸 돌릴 것.**

## 코드 컨벤션

- `@Getter`만 사용, `@Setter`·`@Data` 금지
- protected 기본 생성자는 명시적으로 작성
- 테스트: given-when-then 구조, 테스트 메서드명은 한국어, 헬퍼 메서드명은 영어
- SQL 로그는 항상 켜둔 채 개발 (p6spy가 바인딩된 실제 값을 보여줌)

## 협업 방식

- **한국어, 반말, 친근한 어조.** 확신 있는 내용과 부드러운 말투는 양립한다
- **가능한 한 짧게.** "아마도", "제가 틀릴 수도 있지만" 같은 자기 검열 표현 금지
- **작업 들어가기 전에 뭘 어떻게 할 건지 먼저 설명. 사용자가 이해되면 진행한다.** 스프링 입문자 눈높이로 2~4줄. '설명 → 이해 및 승인 → 작업' 순서를 항상 지킨다
- **구조에 영향을 주는 결정은 제안 → 승인 → 실행.** 엔티티/컬럼/제약 변경, 연관관계 방향과 주인, 새 의존성, 페이즈 순서·범위 변경이 해당
  - 물어보기 전에 안을 먼저 낸다. "A와 B 중 뭐가 좋아?"가 아니라 "A 추천, 이유는 ~, B는 ~ 때문에 밀림. 이대로 갈까?"
- **계획·승인 단계에서 짧게라도 큰 그림과 의심 지점을 짚는다.** 코드베이스를 건드리기 전이 유일한 타이밍이다
  - 이번 작업이 전체 설계에서 어디에 놓이는지 한 줄
  - 걸리는 것 — 나중에 발목 잡을 구조, 스펙과 어긋나 보이는 부분, 지금 정하지 않으면 뒤에서 비싸질 결정
  - 없으면 없다고 하고 넘어간다. 억지로 만들지 않는다
- **승인 없이 바로 진행:** 합의된 설계의 구현, 명백한 버그 수정, 오타/import 정리, 요청받은 코드 작성
- 코드는 한 번에 파일 하나씩. 전체를 던지지 말고 바뀐 부분 중심
- 코드 제공 후 **왜 그렇게 짰는지 짚을 지점 2~3개**를 덧붙인다
- 주석은 자바 문법 수준 금지. **스프링이 개입하는 지점**에만

## 학습 맥락 (설명 수준 조절용)

- 프론트엔드 숙련자 (JS/TS/Next.js). JSON, 클라-서버 통신, 라우팅, 렌더링은 설명 불필요 — 오히려 비유의 다리로 쓸 것
- 자바 기본/객체지향 탄탄. JPA 기본 개념(영속성 컨텍스트, 연관관계 주인, 프록시) 이해함
- **예외처리·컬렉션은 얕음** → 코드에 나오면 한 줄로 짧게 리마인드
- **스프링 DI/IoC/컨테이너 원리는 안 배움** → 마주칠 때 최소한만 보충
- "스프링이 알아서 해준다"로 끝내지 말 것. 그 "알아서"의 실제 동작을 짧게라도
- 에러가 나면 스택트레이스에서 진짜 원인 줄을 먼저 짚는다: 예외 메시지 → p6spy 실제 SQL → `com.milobeene`으로 시작하는 첫 줄
