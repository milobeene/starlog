-- Spring Session JDBC 세션 저장소 (O-4).
--
-- **왜 DB로 옮기나** — Render 무료는 15분 무활동이면 JVM이 죽는다. 세션이 메모리에 있으면
-- 깰 때마다 전원 로그아웃이라, 지인 몇 명이 가끔 쓰는 패턴에서는 매번 로그인해야 한다.
--
-- **이 파일만 규칙이 다르다.** V1은 손으로 설계했지만 여기는 spring-session-jdbc 4.1.0의
-- `org/springframework/session/jdbc/schema-postgresql.sql`을 **식별자까지 그대로** 옮긴 것이다.
-- 이름을 우리 취향으로 바꾸지 않은 이유 — Spring Session을 올릴 때 그쪽 스크립트와 diff를
-- 떠서 스키마 변경을 감지하는 게 유일한 방법인데, 개명하면 그 diff가 전부 노이즈가 된다.
-- 대문자 원본을 소문자로만 낮췄다 (미인용 식별자라 의미가 같고, V1과 눈으로 맞추기 위함).
--
-- **BYTEA는 H2에서도 돈다.** dev의 H2는 MODE=PostgreSQL이고 BYTEA를 VARBINARY 별칭으로 받는다.
-- 공식 H2 스크립트는 이 자리에 LONGVARBINARY를 쓰지만, 파일을 둘로 쪼개면 dev와 prod의
-- 스키마가 갈린다 — V1이 한 파일로 양쪽을 덮은 것과 같은 판단이다. FlywayMigrationTest가 H2에서 지킨다.
--
-- 초기화 주체는 Flyway다. `spring.session.jdbc.initialize-schema=never`로 못박아뒀다 —
-- 안 그러면 Spring Session이 제 스크립트로 테이블을 또 만들려 든다.

create table spring_session (
    primary_id            char(36) not null,
    session_id            char(36) not null,
    creation_time         bigint   not null,
    last_access_time      bigint   not null,
    max_inactive_interval int      not null,
    expiry_time           bigint   not null,
    -- 전 세션 무효화(FR-AUTH-05·09)가 이 컬럼으로 회원을 찾는다.
    -- 값은 Authentication#getName() = MemberPrincipal.getUsername() = 이메일이다
    principal_name        varchar(100),
    constraint spring_session_pk primary key (primary_id)
);

create unique index spring_session_ix1 on spring_session (session_id);
create index spring_session_ix2 on spring_session (expiry_time);
create index spring_session_ix3 on spring_session (principal_name);

create table spring_session_attributes (
    session_primary_id char(36)     not null,
    attribute_name     varchar(200) not null,
    attribute_bytes    bytea        not null,
    constraint spring_session_attributes_pk primary key (session_primary_id, attribute_name),
    -- on delete cascade — 세션 행이 지워지면 속성도 같이 간다. 우리 도메인 테이블은
    -- cascade를 안 쓰지만(삭제 순서를 MemberPurgeService가 명시), 여기는 상류 스키마를 따른다
    constraint spring_session_attributes_fk foreign key (session_primary_id)
        references spring_session (primary_id) on delete cascade
);
