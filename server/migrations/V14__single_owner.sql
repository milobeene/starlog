-- 주인 한 명 모양으로 (v2, 2026-10-24, C1).
--
-- 웹 시절의 "여러 회원" 흔적을 걷는다. 로그인이 사라진 뒤로 모든 쿼리·유니크·소유권 검사가
-- **존재하지 않는 두 번째 사용자**를 위해 돌고 있었다.
--
--   1. `auth_token`(이메일 인증·비번 재설정 토큰)과 `member`의 로그인 컬럼을 지운다
--   2. 데이터 테이블의 `member_id`를 지우고, 유니크 `(member_id, …)`는 member_id만 뺀 같은 제약으로
--   3. `member`는 프로필 한 행(닉네임·메모·배경)으로 남긴다 — 한 행을 넘지 못하게 막는다
--   4. 배경 프리셋(`background_presets`)을 프로필에 더한다
--
-- ⚠️ **실데이터(Neon)에서 처음 도는 파일이다.** 그래서 지우기 전에 "데이터가 한 사람의 것"임을
-- 먼저 증명하고, 아니면 **합치지 않고 멈춘다.** 둘을 합치면 같은 이름의 플랫폼·태그가 유니크에서
-- 터지거나, 터지지 않으면 남의 기록이 조용히 섞인다 — 어느 쪽이든 되돌릴 수 없다.
-- 트랜잭션 하나라 멈추면 아무것도 안 바뀐다.

-- ── 0. 한 사람의 데이터인가 ────────────────────────────────────────────
--
-- 회원이 하나면 FK 때문에 모든 행이 그 사람 것이다. 표마다 따로도 센다 —
-- 회원 수 검사만으로도 충분하지만, 멈췄을 때 **어느 표가** 문제인지 바로 보이게
do $$
declare
  members bigint;
  owners  bigint;
  t       text;
begin
  select count(*) into members from member;
  foreach t in array array['platform', 'device', 'emulator', 'input_method', 'platform_account',
                           'subscription', 'tag', 'genre', 'backlog_entry'] loop
    execute format('select count(distinct member_id) from %I', t) into owners;
    if owners > 1 then
      raise exception 'V14 중단: % 테이블에 회원 %명의 행이 섞여 있다. 한 명 것만 남긴 뒤 다시 열 것', t, owners;
    end if;
  end loop;
  if members > 1 then
    raise exception 'V14 중단: 회원이 %명이다. 프로필은 한 행만 남길 수 있다 — 쓰지 않는 회원을 지운 뒤 다시 열 것', members;
  end if;
end $$;

-- ── 1. 로그인 ─────────────────────────────────────────────────────────

drop table auth_token;

alter table member drop constraint uk_member_email;
alter table member drop constraint uk_member_google_subject;
alter table member drop constraint chk_member_role;
drop index idx_member_deleted_at;
alter table member drop column email;
alter table member drop column password;
alter table member drop column google_subject;
alter table member drop column role;
alter table member drop column email_verified;
alter table member drop column approved_at;
alter table member drop column deleted_at;

-- 프로필은 한 행. 상수 식 유니크 인덱스라 두 번째 insert가 23505로 막힌다 —
-- 클라우드에서 첫 기동 요청 둘이 동시에 "주인이 없네"를 보면 둘 다 만들려 들기 때문이다
create unique index uk_member_single on member ((true));

-- 내 배경 프리셋 — `[{"name":"…","colors":["#RRGGBB",…×5]}]` (최대 12개, 서버가 검증한다).
-- 색 다섯 칸(`background_colors`)과 달리 목록이고 이름이 붙어서 JSON 글자로 둔다.
-- **null = 없음.** 화면에는 빈 목록으로 나간다
alter table member add column background_presets text;

-- ── 2. 데이터 테이블의 member_id ──────────────────────────────────────
--
-- 제약·인덱스는 컬럼을 지우면 PostgreSQL이 같이 지우지만, **이름을 보고 고를 수 있게** 손으로 지운다.
-- 유니크 이름은 member를 뺀 이름으로 다시 단다. 인덱스는 V1 때의 근거(정렬·필터 경로)가 member_id 없이도
-- 그대로라 member_id만 뺀 모양으로 다시 건다 — 근거가 사라진 것만 안 건다

alter table platform drop constraint uk_platform;
alter table platform drop constraint fk_platform_member;
alter table platform drop column member_id;
alter table platform add constraint uk_platform unique (name);

alter table device drop constraint uk_device;
alter table device drop constraint fk_device_member;
alter table device drop column member_id;
alter table device add constraint uk_device unique (label);

alter table emulator drop constraint uk_emulator;
alter table emulator drop constraint fk_emulator_member;
alter table emulator drop column member_id;
alter table emulator add constraint uk_emulator unique (name);

alter table input_method drop constraint uk_input_method;
alter table input_method drop constraint fk_input_method_member;
alter table input_method drop column member_id;
alter table input_method add constraint uk_input_method unique (name);

-- owner_key 정합성 체크(V13)는 member_id와 무관해 그대로 남는다
alter table platform_account drop constraint uk_platform_account;
alter table platform_account drop constraint fk_platform_account_member;
alter table platform_account drop column member_id;
alter table platform_account add constraint uk_platform_account unique (owner_key, account_label);

-- 회원별 목록 인덱스였다. 목록이 곧 전체라 근거가 사라졌다
drop index idx_subscription_member;
alter table subscription drop constraint fk_subscription_member;
alter table subscription drop column member_id;

alter table tag drop constraint uk_tag_member_name;
alter table tag drop constraint fk_tag_member;
drop index idx_tag_member_order;
alter table tag drop column member_id;
alter table tag add constraint uk_tag_name unique (name);
create index idx_tag_sort_order on tag (sort_order);

alter table genre drop constraint uk_genre_member_name;
alter table genre drop constraint fk_genre_member;
alter table genre drop column member_id;
alter table genre add constraint uk_genre_name unique (name);

-- 백로그 — 정렬 인덱스는 방향(desc nulls last)까지 V1 그대로 (V1 머리말의 이유)
alter table backlog_entry drop constraint uk_backlog_entry_member_game;
alter table backlog_entry drop constraint fk_backlog_entry_member;
drop index idx_backlog_member_status;
drop index idx_backlog_member_last_played;
drop index idx_backlog_member_display_name;
drop index idx_backlog_member_released_on;
drop index idx_backlog_member_rating;
drop index idx_backlog_member_play_time;
drop index idx_backlog_member_tag;
-- 게임 하나에 항목 하나가 이제 유니크의 선두라 따로 둘 필요가 없다 (V1의 FK 인덱스 정책)
drop index idx_backlog_entry_game;
alter table backlog_entry drop column member_id;
alter table backlog_entry add constraint uk_backlog_entry_game unique (game_id);

create index idx_backlog_status on backlog_entry (status);
create index idx_backlog_last_played on backlog_entry (last_played_on desc nulls last);
create index idx_backlog_display_name on backlog_entry (display_name);
create index idx_backlog_released_on on backlog_entry (released_on_resolved desc nulls last);
create index idx_backlog_rating on backlog_entry (rating desc nulls last);
create index idx_backlog_play_time on backlog_entry (play_time_hours desc nulls last);
-- 태그 필터·파셋, 그리고 태그 삭제 전파(tag_id 단독 조건)가 이제 이 인덱스를 탄다
create index idx_backlog_tag on backlog_entry (tag_id);
