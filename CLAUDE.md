# game-backlog

게임 백로그 관리 서비스. Spring Boot REST API + Next.js. 개인 학습용 습작 프로젝트.

## 참조 문서 (필요할 때 읽을 것, 미리 다 읽지 말 것)

- `docs/spec-v1.5.md` — 기능명세서. **모든 설계 판단의 기준**
- `docs/entity-design-v0.3.md` — 엔티티 설계서 (Phase 1 완료)
- `docs/api-design-v0.1.md` — API 설계서 (Phase 2). 화면에서 역산한 엔드포인트
- `docs/dev-order.md` — 개발 순서. 슬라이스 A~P 단위로 진행
- `docs/스프링_어플리케이션_개발시_체크리스트.md`

## 스택

- Spring Boot 4.1.0 / Java 21 / Gradle Groovy
- H2 (dev, TCP 서버 모드) / Neon PostgreSQL (prod)
- Spring Data JPA — `JpaRepository` 직접 상속 금지, `BaseRepository` 사용 (아래 JPA 12번)
- QueryDSL은 L-1(Phase 6)에서 도입. 그전까지 동적 쿼리 없음
- p6spy, Lombok, Spring Security(Phase 3), RestClient + RAWG API(Phase 4)
- 패키지: `com.milobeene.gamebacklog`
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
