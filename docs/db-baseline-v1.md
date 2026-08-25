# DB 베이스라인 설계 노트 (V1 재작성, 2026-08-26)

`V1__init.sql`을 아침에 눈으로 승인하기 위한 결정 대장. **바꾸자고 하면 V1 수정 + Neon 재적용 2분**이면 된다 (빈 DB라 되돌림 비용 없음).

## 왜 다시 썼나

V1(덤프 감사본) → V2(선택지 회원 소유) → V3(승인제)의 3단 역사를 **한 판으로 청산**했다.
첫 실배포 전 + 데이터 소모품인 지금만 공짜로 할 수 있는 일이다. 옛 판은 git 이력에 있다.
`V2DataMigrationTest`(데이터 이행 검증)는 대상이 사라져 함께 삭제.

## 테이블별 결정

| 결정 | 근거 |
|---|---|
| **entity_snapshot 삭제** (엔티티 포함) | FR-BL-09(SHOULD)용인데 리포지토리·서비스·엔드포인트가 전무한 죽은 테이블. 구현하는 날 마이그레이션으로 추가. `MemberPurgeService`의 삭제 순서에서도 제거 |
| member_device 부재 | V2에서 흡수된 역사 자체를 지움 — 새 판엔 처음부터 없음 |
| member.approved_at 포함, **인덱스는 안 둠** | 승인제가 회원 수를 강제로 작게 유지. 단독 필터 경로 없음 (V3에 있던 idx는 근거 없어 제거) |
| **audit_log.created_at 인덱스 신설** | 보존기간(1년) 삭제 배치가 `created_at < threshold`로 훑는데 옛 판엔 인덱스가 없었다. 로그는 단조 증가라 유일한 전체 스캔 경로였음 |
| **playthrough.input_method_id FK + 인덱스** | enum 시절 check 제약(`chk_playthrough_input_method`) 흔적 없이 처음부터 FK로 |
| 선택지 5종에 회원별 인덱스 없음 | `unique(member_id, …)`의 선두 컬럼이 회원 조회를 접두어로 커버 |
| subscription.member_id 인덱스 유지 | 유니크가 없어 접두어 커버 불가 |
| FK 인덱스는 **경로 있는 것만** | PG는 FK에 인덱스 자동 생성 안 함. 각 인덱스 옆 주석이 근거 쿼리 |
| 부분 인덱스(`where deleted_at is null`) 안 씀 | H2(dev)가 미지원. dev·prod 스키마 동형 유지가 우선 |
| game.name 검색 인덱스 없음 | `like '%…%'`는 btree 불가. 마스터가 커지면 PG 전용 trigram 검토 (주석으로 남김) |

## 검증 상태

- `FlywayMigrationTest` — 빈 DB에 V1 적용 후 Hibernate validate로 엔티티 전수 대조 ✅
- 전체 테스트 409개 ✅ (V2DataMigrationTest 삭제로 -1)
- 스키마 집중 미니 리뷰(3렌즈) 결과는 아래 §리뷰에 추가됨

## 스키마 미니 리뷰 결과 (3렌즈 × 반박 검증, 2026-08-26)

에이전트 10개(렌즈 리뷰 3 + 발견별 반박 검증)가 돌았고, **확정 3건 반영 / 기각 1건**.

| 판정 | 내용 | 조치 |
|---|---|---|
| ✅ 확정 | 정렬 인덱스 누락 — FR-QRY-04의 평점순, 대시보드 최다 플레이 타일이 실호출하는 경로인데 인덱스가 없었다. 기존 주석이 상태 **필터**를 정렬로 잘못 세어 누락을 가렸음 | `(member_id, rating)` `(member_id, play_time_hours)` 추가 |
| ✅ 확정 | 정렬 방향 불일치 — 쿼리는 전부 `desc nulls last`인데 방향 무지정 btree는 PG 역방향 스캔이 `desc nulls first`라 정렬을 못 태움. **H2 dev에서는 관측 불가능한 prod 전용 괴리** | 정렬 인덱스 4종에 `desc nulls last` 명시 (이름순만 asc 유지) |
| ✅ 확정 | auth_token 정리 배치의 술어가 OR 두 팔(`expires_at` / `used_at`)인데 한쪽만 인덱스 — BitmapOr 불성립으로 전체 스캔, 기존 주석은 거짓 근거였음 | `idx_auth_token_used_at` 추가 |
| ❌ 기각 | BR-PT-01·06을 check 제약으로 — 주장된 우회 경로(스냅샷 복원·벌크 UPDATE)가 실존하지 않아 실패 시나리오 재구성 불가 | 반영 안 함 |

셋 다 공통점: **Hibernate validate와 테스트 409개가 원리적으로 못 잡는 부류**(validate는 인덱스를 안 보고, H2는 방향 기본값이 달라 증상이 안 남). 손설계를 리뷰로 받친 이유가 이것.

## Neon 실검증 결과 (2026-08-26)

`drop schema` → 새 V1 적용 → prod 프로필 기동 → API 왕복까지 실물 PostgreSQL에서 확인.

- V1 적용·Hibernate validate·`desc nulls last` 인덱스 반영 전부 ✅
- 로그인/선택지 시딩/가입 차단/수동 게임→담기→회차/파셋(JPQL FQCN 치환 검증)/정렬 3종/관리자 3탭 ✅
- 검증 데이터는 전부 청소 — 최종 상태: **빈 테이블 25개 + flyway 이력 V1 한 줄**

**실검증이 잡은 실버그 — H2로는 원리적으로 못 잡는 부류:**

`:param is null or …` JPQL 관용구가 PostgreSQL에서 죽는다. PG는 null 파라미터의 타입을
문맥으로 못 정하면 거부한다 — concat 안이면 `lower(bytea)`, 단독 `? is null`이면
`could not determine data type`. **H2는 둘 다 관대해서 테스트 409개가 초록불인 채였다.**
관리자 회원·게임 검색 두 곳이 500이었고, "조건 없음"을 null 대신 값(빈 문자열 / 날짜 경계값)으로
바인딩하는 방식으로 수정했다.

→ 교훈: H2 기반 테스트는 PG 전용 오류 부류(타입 추론·인덱스 방향·문법 방언)를 못 덮는다.
Testcontainers(실 PG로 테스트) 도입이 아침 결정 후보다.
