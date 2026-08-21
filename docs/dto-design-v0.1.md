# 게임 백로그 — DTO 설계 원칙 v0.1

| 항목 | 내용 |
|---|---|
| 문서 버전 | v0.1 |
| 최종 수정 | 2026-08-21 (H-2~H-6 구현 결과 반영) |
| 상태 | **확정** — Phase 2 (H-1) 산출물 |
| 기준 명세 | 기능명세서 v1.5, API 설계서 v0.1 (`docs/api-design-v0.1.md`) |

> H-1은 코드를 많이 짜는 단계가 아니라 **규약을 못 박는 단계**다.
> 여기서 안 정하면 H-2·H-3·H-4에서 컨트롤러마다 제각각으로 굳는다. H-5를 먼저 한 이유와 같다.

---

## 0. 원칙

```
엔티티는 웹 경계를 넘지 않는다        NFR-A3
변환은 트랜잭션 안에서 끝낸다          open-in-view: false — 컨트롤러에서 LAZY를 건드리면 터진다
의존은 웹 → 도메인 한 방향             NFR-A1 — 서비스는 HTTP를 모른다
```

---

## 1. 패키지와 이름

```
backlog/dto/BacklogListResponse.java        읽기 — 화면 단위
backlog/dto/BacklogDetailResponse.java
backlog/dto/PlaythroughCreateRequest.java   쓰기 — 리소스 단위
backlog/controller/BacklogController.java

common/dto/PageResponse.java                공용
common/dto/MoneyRequest.java
common/dto/MoneyResponse.java
common/dto/IdResponse.java
common/web/LoginMember.java                 웹 인프라
common/web/LoginMemberArgumentResolver.java
```

- `dto/` 아래를 `request/`·`response/`로 더 쪼개지 않는다. 접미사로 이미 구분되고 지금 규모에 디렉터리 2겹은 과하다
- 모든 DTO는 **record**. 불변이고 `@Getter`·기본 생성자 규칙(CLAUDE.md)과 충돌하지 않는다

### 1.1 화면 단위 응답은 중첩 record 한 파일

상세 응답(API §1.3)의 `resolved`/`master`/`overrides`/`playthroughs`를 파일 10개로 흩지 않는다.

```java
public record BacklogDetailResponse(
        Long entryId,
        BacklogStatus status,
        Resolved resolved,
        Master master,
        List<PlaythroughItem> playthroughs
) {
    public record Resolved(String name, List<String> developers, ...) {}
    public record Master(Long gameId, String name, ...) {}
    public record PlaythroughItem(Long playthroughId, int sequenceNo, ...) {}
}
```

JSON 모양이 파일 하나에 그대로 보인다. 프론트에서 응답 타입을 하나로 읽는 것과 같다.

---

## 2. 변환 — 어디서 누가

| 방향 | 위치 | 형태 |
|---|---|---|
| Request → Command | Request DTO | `command.toCommand()` 인스턴스 메서드 |
| Entity → Response | Response DTO | `Response.from(entity)` 정적 팩토리 |

```java
// 웹이 도메인을 안다. 도메인은 웹을 모른다
public record OverrideUpdateRequest(String name, ..., MoneyRequest listPrice) {
    public OverrideCommand toCommand() {
        return new OverrideCommand(name, developers, publishers, releasedOn, listPrice.toMoney());
    }
}
```

이 방향 덕에 Bean Validation 애노테이션이 도메인 record로 새지 않는다 (H-0 §4.2의 결정 근거).

**Response의 `from()`은 반드시 트랜잭션 안에서 호출된다.** 즉 컨트롤러가 아니라 조회 전용 서비스가 부른다.

### 2.1 "트랜잭션 안에서 변환"은 참조 이동이 아니라 값 읽기다 (H-2에서 실제로 터뜨림)

`from()`을 트랜잭션 안에서 불렀는데도 `LazyInitializationException`이 났다.

```java
// 처음엔 DTO마다 List.copyOf를 감싸는 "호출부 규율"로 막았는데,
// 다음 DTO가 잊으면 컴파일도 테스트도 통과한 채 프로덕션에서만 터진다.
// 그래서 엔티티로 옮겼다 — 잊는 것 자체가 불가능한 자리
public List<String> resolvedDevelopers() {
    return List.copyOf(developerOverrides.isEmpty() ? game.getDevelopers() : developerOverrides);
}
public List<String> getDeveloperOverrides() {   // 손으로 쓴 getter가 있으면 Lombok이 건너뛴다
    return List.copyOf(developerOverrides);
}
```

**규칙**: 컬렉션을 밖으로 내보내는 엔티티 메서드(`resolved*`, 문자열 컬렉션 getter)가
**스스로 복사본을 반환한다.** DTO는 감쌀 필요가 없다. 이미 불변 리스트면 `List.copyOf`가
복사 없이 그대로 돌려주므로 중복 비용도 없다.

**주의** — 이건 테스트로 못 잡는다. `@Transactional`을 붙인 MockMvc 테스트는 요청 전체가
한 트랜잭션 안이라 예외가 안 난다. 앱을 띄워서 확인해야 한다.

---

## 3. 서비스 반환 타입

| | 반환 | 비고 |
|---|---|---|
| 읽기 | **DTO** | H-2에서 조회 전용 서비스 신설 |
| 쓰기 (생성) | `Long id` | 이미 안전 |
| 쓰기 (수정·삭제) | `void` | |

### 3.1 컨트롤러는 엔티티를 보지 않는다 — 강제 규칙

Phase 1 서비스에 엔티티를 반환하는 메서드가 남아 있다.

```
BacklogService.findOne / findAll        → BacklogEntry
PlaythroughService.findAll              → List<Playthrough>
AcquisitionService.findAll              → List<Acquisition>
PlatformAccountService.findSelectable   → List<PlatformAccount>
SubscriptionService.findAll             → List<Subscription>
MemberDeviceService.findAll             → List<MemberDevice>
MemberService.findOne                   → Member
```

이것들은 **서비스 내부와 테스트 전용**이다. 컨트롤러에서 호출 금지.

부르면 `open-in-view: false` 때문에 응답 직렬화 시점에 `LazyInitializationException`이 난다.
트랜잭션은 서비스 메서드가 끝나면서 이미 닫혔고, 그 뒤 Jackson이 프록시를 건드리기 때문이다.

읽기는 H-2에서 `BacklogQueryService` 같은 **조회 전용 서비스**를 새로 만들어 DTO를 반환한다 (API §0).

---

## 4. 공용 DTO

### 4.1 `PageResponse<T>` — Spring `Page`를 그대로 내보내지 않는다

`Page<T>`를 직렬화하면 `pageable`·`sort`·`numberOfElements` 같은 내부 구조가 응답에 노출되고 Spring 버전에 묶인다 (H-0 §4.3).

```java
PageResponse.from(page.map(BacklogCardResponse::from))
```

`Page.map()`으로 **엔티티 → DTO 변환을 트랜잭션 안에서** 끝낸 뒤 감싼다. 필드는 API §1.1이 약속한 4개 + `items`뿐이다.

### 4.2 `MoneyRequest` / `MoneyResponse`

Command는 평평하다 (`priceAmount`, `priceCurrency`). JSON은 중첩이 자연스럽다.

```jsonc
{ "price": { "amount": 89800, "currency": "KRW" } }
```

- `MoneyRequest.toMoney()` — `amount`가 null이면 **Money 통째로 null**. 기존 `AcquisitionCommand` 주석의 규칙 그대로
- 평평한 Command로 넘길 땐 `request.price().amount()`로 풀어 쓴다
- `MoneyResponse.from(money)` — money가 null이면 null
- 통화 코드 검증은 `Money` 생성자가 한다. DTO는 검증하지 않는다 (규칙이 두 곳에 생기면 갈라진다)

### 4.3 `IdResponse`

생성 응답 바디. `201` + `Location` 헤더와 함께 나간다 (§6).

### 4.4 `ErrorResponse` / `RevivableErrorResponse`

H-5에서 이미 만들었다. `common/exception/`에 그대로 둔다 — 예외 핸들러와 짝이라 그쪽이 응집도가 높다.

---

## 5. 직렬화 규약

| 대상 | 규칙 |
|---|---|
| 문자열 빈값 | `strip()` 후 빈 문자열은 **null로 수렴** (`TextValues.normalize`) |
| enum | 이름 그대로 (`"PLAYING"`). 한국어 라벨은 프론트 몫 |
| 날짜 | `LocalDate` → `"2026-05-27"`, `LocalDateTime` → ISO-8601. Boot 기본값이라 별도 설정 없음 |
| 금액 | `BigDecimal` → JSON 숫자. `scale 2`는 `Money`가 보장 |
| null 필드 | **지우지 않고 그대로 내보낸다.** 프론트가 키 존재를 믿을 수 있어야 한다 |

### 5.1 PUT은 전부 전체 교체 — "안 보낸 필드 = 지움"

서비스가 전부 전체 교체다 (API §2.1). 부분 수정 의미론이 **없다.**

- 필드 생략과 명시적 `null`을 구분하지 않는다
- 프론트는 항상 전체를 보낸다. 한 필드만 바꾸려면 나머지를 현재값으로 채워 보낸다
- `PATCH`를 쓰지 않는 이유가 이것이다

### 5.2 `overrides`의 `[]` vs `null`

엔티티는 리스트 오버라이드를 `isEmpty()` 기준으로 "안 덮어씀"이라 본다 (설계서 §5.2). 스칼라는 `null` 기준이다.
**요청·응답 모두 이 규칙을 그대로 쓴다.**

```jsonc
"overrides": {
  "name": null,           // 스칼라 — null = 안 덮어씀
  "developers": [],       // 리스트 — 빈 배열 = 안 덮어씀
  "releasedOn": null,
  "listPrice": null
}
```

리스트에 `null`을 보내도 `TextValues.replaceAll`이 빈 리스트와 같게 처리한다. 응답은 항상 `[]`로 통일한다.

---

## 6. 응답 형태와 상태코드

| 상황 | 코드 | 바디 | 헤더 |
|---|---|---|---|
| 조회 | `200` | 응답 DTO | |
| 생성 | `201` | `{"id": 12}` | `Location: /api/backlog/12` |
| 수정 | `200` | 없음 | |
| 삭제 | `204` | 없음 | |
| 실패 | 4xx | `ErrorResponse` | |

생성에서 `Location`과 바디를 **둘 다** 주는 이유 — `Location`이 REST 규약이지만 프론트가 헤더를 파싱하는 것보다 바디에서 id를 꺼내는 게 싸다.

---

## 7. 검증은 두 겹

| 겹 | 위치 | 대상 | 예외 |
|---|---|---|---|
| 형태 | Request DTO (`@NotNull`, `@Size`, `@Pattern`) | 값 하나만 보면 아는 것 | `MethodArgumentNotValidException` → 400 |
| 규칙 | 엔티티·서비스 | 다른 값·다른 행을 봐야 아는 것 | `InvalidInputException` 400 / `ConflictException` 409 |

- **Bean Validation은 형태만 본다.** 평점 `0.0~100.0` 같은 도메인 불변식은 엔티티에 이미 있고, 거기서 뺏지 않는다
- 두 겹이 겹치는 건 낭비가 아니다. 웹은 400을 빨리 주고, 엔티티는 웹을 안 거치는 호출(임포트, 배치)에서도 지킨다
- 애노테이션을 실제로 채우는 건 **H-6**이다. H-1에서는 자리만 잡는다

---

## 8. 회원 식별 — `@LoginMember` (Phase 3 이전 임시)

```java
@GetMapping("/api/backlog")
public PageResponse<BacklogCardResponse> list(@LoginMember Long memberId) { ... }
```

- `X-Member-Id` 헤더를 리졸버가 읽는다. **컨트롤러는 헤더 이름을 모른다**
- Phase 3에서 리졸버 구현만 세션 기반으로 갈아끼우면 컨트롤러 시그니처가 그대로 산다
- 지금은 헤더를 그냥 믿는다. 인증이 아예 없는 단계라 어쩔 수 없다. 헤더가 없거나 숫자가 아니면 400

---

## 9. 체크리스트 — H-2·H-3·H-4에서 매번

- [ ] 컨트롤러 반환 타입이 DTO인가 (엔티티·`Page`·`Optional` 아님)
- [ ] `from()`을 트랜잭션 안에서 불렀는가
- [ ] 회원 식별이 `@LoginMember`인가 (`@RequestHeader` 직접 사용 금지)
- [ ] 생성이 `201` + `Location` + `IdResponse`인가
- [ ] 남의 것 접근이 `404`인가 (`403` 금지 — API §3)
- [ ] 컬렉션을 내보내는 새 엔티티 메서드가 `List.copyOf()`를 반환하는가 (§2.1 — DTO가 아니라 엔티티 책임)
- [ ] p6spy 로그로 쿼리 개수를 셌는가 — **앱을 실제로 띄워서**
