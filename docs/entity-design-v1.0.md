# 엔티티 설계서 v1.0 (Phase 9 전면 개정)

> v0.4는 Phase 2(H-6)에서 멈춰 있었다. 이후 회원 소유 선택지 전환(스펙 v1.8),
> 가입 승인제·인증 잠금(v1.9), 스키마 베이스라인 재작성이 겹겹이 쌓여
> **문서가 코드를 대변하지 못하는 상태**라 전면 개정했다.
> 스키마의 물리 설계 근거는 `db-baseline-v1.md`, DDL 원본은 `V1__init.sql`.

## 0. 한눈에 — 소유권 지도

```
전역 (공유, 관리자만 수정)          회원 소유 (각자 CRUD)
─────────────────────          ──────────────────────────────
Game (+developer/publisher/     Member
  master_genre/release_platform)  ├─ Platform ──┐
                                  ├─ PlatformAccount ← Platform FK
                                  ├─ Device / Emulator / InputMethod
                                  ├─ Subscription
                                  ├─ Tag / Genre (사전, §6.7 자동 소멸)
                                  └─ BacklogEntry ── Game FK
                                       ├─ Playthrough → Device·PlatformAccount·Emulator·InputMethod
                                       ├─ Acquisition → Platform·PlatformAccount·Subscription
                                       ├─ tag_id FK → Tag (항목당 1개, §6.7 v1.6)
                                       ├─ BacklogEntryGenre → Genre (여러 개)
                                       └─ CoverImage (1:1)
AuditLog · AuthToken는 Member에 매달린 시스템 기록
```

## 1. 공통 뼈대

| 클래스 | 역할 |
|---|---|
| `BaseEntity` | `@MappedSuperclass`. createdAt/updatedAt (JPA Auditing) |
| `MemberOwnedEntity` | BaseEntity + member FK + deletedAt. **선택지 5종의 공통 뼈대** — 소프트 삭제·소유권 검사(`isOwnedBy`)·`displayName()` 계약. `@MappedSuperclass`라 테이블이 아니라 각 테이블에 컬럼으로 복사된다 |
| `Money` | `@Embeddable` amount(19,2)+currency(ISO 4217). setScale 후 검증, 비교는 compareTo |

## 2. 선택지 5종 (Platform · Device · Emulator · InputMethod · PlatformAccount)

전부 `MemberOwnedEntity` 상속. **회차·취득이 참조하므로 물리 삭제가 없다** — deletedAt으로
선택지에서만 빠지고 과거 기록엔 "(삭제됨)"으로 남는다 (§7.4).

| 엔티티 | 유니크 | 고유 필드 | 재추가 시 |
|---|---|---|---|
| Platform | (member, name) | name | 조용히 되살림 |
| Device | (member, **label**) | deviceType·label·memo(md) — 마스터 없음, 직접 입력. 라벨이 정체성 | 되살리며 유형·메모 덮음 |
| Emulator | (member, name) | name·memo(md) | 되살리며 메모 덮음 |
| InputMethod | (member, name) | name — **원래 enum 4개였다가 테이블 승격** | 조용히 되살림 |
| PlatformAccount | (member, platform, label) | Platform FK + label. 플랫폼 이름이 바뀌면 따라간다 | **409 + 확인** — 취득(구매 이력)까지 물어서 사용자가 알고 되살린다 |

- 이름 변경은 FK를 타고 과거 기록에 자동 전파 (값 복사 없음)
- 플랫폼 소프트 삭제 → 딸린 계정도 함께 닫힘
- 가입 시 `DefaultCatalogSeeder`가 기본 플랫폼 6종 + 입력 방식 4종을 복사 (기기·에뮬은 개인 하드웨어라 비움)
- 소유권 검사 공통화: `OwnedCatalog.require/requireAlive` — 남의 것은 404로 뭉갬 (NFR-S7)

## 3. Member

- `approvedAt` — **null = 승인 대기** (FR-ADM-06). 로그인 핸들러 2곳(폼·구글)이 세션을 안 남기고 403
- `deletedAt` — 탈퇴 유예 30일. `ROLE_PENDING_DELETION`으로 복구 외 전부 차단
- `password` null = 구글 전용 계정. v1.9 잠금: 비밀번호 신규 설정·구글 연결 해제·재설정 경유 생성 전부 거부
- `googleSubject` — 이메일이 아니라 구글 sub를 저장 (이메일은 바뀔 수 있음)

## 4. BacklogEntry와 비정규화 3종 (§7.2)

- `displayName` = nameOverride ?? game.name — 정렬·검색이 이 컬럼 하나를 탄다
- `releasedOnResolved` = COALESCE(override, master) — 출시일 정렬용
- `lastPlaythrough` FK — 최신 회차 판정(§7.6: COALESCE(종료일, 시작일))의 캐시. **Playthrough와 상호 참조**라
  탈퇴 물리 삭제 때 이 참조를 먼저 끊어야 한다 (MemberPurgeService)
- status는 회차·취득에서 파생 (`syncDerivedState`) — 화면에 상태 드롭다운이 없는 이유
- 오버라이드 컬렉션(developer/publisher)은 `@ElementCollection` — 인스턴스 유지한 채 내용만 교체 (TextValues.replaceAll)

## 5. Playthrough / Acquisition

- Playthrough: (entry, sequenceNo) 유니크. 번호는 구멍을 안 메우는 표시용. BR-PT 검증은 엔티티(단독 판단)와
  서비스(형제 대조)로 이원화. **other 프록시 함정** — 형제 값은 반드시 getter로 읽는다
- 참조 4종(기기·계정·에뮬·입력방식)은 전부 회원 소유 → 서비스가 소유권 확인 후 연결. 삭제된 것도
  과거 회차 수정을 위해 findOne은 돌려준다
- Acquisition: 복수 취득이 정상(재구매·DLC). 실물 구매는 platform만, 디지털은 account, 구독 제공은 subscription

## 6. 시스템 기록

- AuthToken: 목적(EMAIL_VERIFICATION/PASSWORD_RESET) + 해시 저장(원문 금지). 만료·사용분은 배치 정리
- AuditLog: 관리자 경로 전체 기록(NFR-S8). 1년 보존 후 배치 삭제
- CoverImage: entry당 1장. R2 storageKey — 행 삭제 전에 key를 모아야 파일 고아가 안 생긴다

## 7. 동시성 방어선

| 불변식 | 방어 |
|---|---|
| 이메일·구글 sub 유일 | DB 유니크 (원칙 7 — 앱 검증은 최선 노력) |
| (member, game) 중복 담기 | DB 유니크 |
| 선택지 이름 중복 | DB 유니크 |
| **BR-PT-02 기간 겹침 / BR-PT-03 진행 중 1개** | **항목 행 비관적 락** — 형제를 봐야 판정되는 규칙이라 DB 제약으로 표현할 수 없다(부분 유니크 인덱스는 H2 미지원이라 dev/prod가 갈린다) |
| 재발송 스로틀, 플랫폼 삭제↔계정 등록 | **없음 (알려진 한계)** — `docs/code-review-2026-08-26.md` |

## 8. 폐기·부재 기록

| 없는 것 | 왜 |
|---|---|
| EntitySnapshot | FR-BL-09(SHOULD) 미구현 — 접근 경로 없는 죽은 테이블이라 베이스라인에서 제거. 구현 시 재추가 |
| MemberDevice | v1.8에서 Device로 흡수. 새 베이스라인엔 역사 자체가 없음 |
| InputMethod enum | 테이블 승격으로 소멸 |
