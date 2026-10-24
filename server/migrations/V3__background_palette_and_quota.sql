-- V3: 배경 팔레트(회원 설정) + 일일 사용량 쿼터.
--
-- 둘을 한 판에 담는다 — 같은 회차의 작업이고, Flyway 이력이 짧을수록
-- 새 환경을 세울 때 재생할 가짜 역사가 줄어든다 (V1 머리말과 같은 이유).
--
-- H2(MODE=PostgreSQL, dev)와 PostgreSQL(prod) 양쪽에서 도는 문법만 쓴다.

-- ============ 배경 팔레트 ============
--
-- 색 5개를 '#rrggbb,...' 한 줄로 담는다. 5칸 고정에 순서가 있어 JSON이 얻는 게 없다.
-- 길이 64는 7×5 + 쉼표 4 = 39에 여유를 둔 값.
--
-- **null = 기본 팔레트를 따른다.** 기본값을 코드에서 바꾸면 한 번도 안 만진 회원은
-- 자동으로 따라온다 — 가입 시점의 색이 박제되지 않는다.
alter table member add column background_colors varchar(64);

-- ============ 일일 사용량 쿼터 ============
--
-- WEB-ONLY: 한 서버를 여럿이 나눠 쓸 때만 의미가 있다 (docs/web-only-inventory.md).
--
-- 인메모리로 두지 않는 이유 — Render 무료는 15분 무활동이면 프로세스를 내린다.
-- 카운터가 매번 0으로 돌아가면 쿼터가 아니라 장식이다.
--
-- PK를 (member_id, usage_date, kind) 복합으로 잡는다. 대리키를 두면 같은 삼중조가
-- 두 줄 생기는 걸 막으려고 유니크 제약을 또 걸어야 한다 — 그럴 바엔 그게 키다.
create table usage_quota (
    member_id   bigint       not null,
    usage_date  date         not null,
    kind        varchar(30)  not null,
    used        integer      not null,
    created_at  timestamp(6),
    updated_at  timestamp(6),
    constraint pk_usage_quota primary key (member_id, usage_date, kind),
    constraint fk_usage_quota_member foreign key (member_id) references member (id),
    constraint chk_usage_quota_kind check (kind in ('GAME_SEARCH','GAME_ADD','COVER_UPLOAD')),
    constraint chk_usage_quota_used check (used >= 0)
);

-- 관리자 화면이 "오늘 누가 얼마나 썼나"를 날짜로 훑는다. PK 선두가 member_id라
-- 날짜만으로는 PK 인덱스를 못 탄다
create index idx_usage_quota_date on usage_quota (usage_date);
