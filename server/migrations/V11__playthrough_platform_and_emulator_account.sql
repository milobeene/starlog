-- 회차의 플랫폼 · 에뮬레이터 계정 (v1.1, 2026-08-29).
--
-- 두 가지를 한 장에 몬다. 세이브파일이 두 번 바뀌지 않게 하려는 것이고, 둘이 실제로
-- 한 이야기이기도 하다 — "어디서 플레이했나"를 제대로 적는 일이다.
--
-- ⚠️ **이 파일은 NOT NULL을 푸는 유일한 마이그레이션이다.** 되돌릴 수 없으므로
-- 돌기 전에 백업이 있어야 한다.

-- ── 1. 회차에 플랫폼을 더한다 ──────────────────────────────────────────
--
-- 지금까지 회차는 계정(platform_account)이나 에뮬레이터만 들고 있었다. 그래서
-- "스팀에서 했다"를 적으려면 계정을 반드시 만들어야 했고, 실물 패키지처럼 계정이라는
-- 개념이 없는 경우는 적을 자리가 없었다.
--
-- 백필은 **계정에서 역산**한다. 계정은 이미 플랫폼에 매여 있으므로 잃는 정보가 없다.
alter table playthrough add column platform_id bigint;

alter table playthrough
    add constraint fk_playthrough_platform foreign key (platform_id) references platform (id);

update playthrough
   set platform_id = (select a.platform_id from platform_account a
                       where a.id = playthrough.platform_account_id)
 where platform_account_id is not null;

-- ⚠️ 계정도 에뮬도 없는 회차는 채울 근거가 없어 null로 남는다. 화면에서 고르면 된다.

-- ── 2. 플랫폼 계정에 에뮬레이터를 허용한다 ────────────────────────────
--
-- 에뮬레이터에도 계정이 있는 경우가 있다(닌텐도 계정을 넣고 쓰는 식).
-- 지금은 platform_id가 NOT NULL이라 에뮬 계정을 만들 자리가 없다.
alter table platform_account add column emulator_id bigint;

alter table platform_account
    add constraint fk_platform_account_emulator foreign key (emulator_id) references emulator (id);

-- **owner_key가 요점이다.**
--
-- 유니크 제약에 nullable 컬럼이 끼면 막지 못한다 — PostgreSQL도 H2도 NULL을 서로
-- 다른 값으로 보기 때문에 (member, platform=1, emu=NULL, '내계정')이 두 번 들어간다.
-- 부분 유니크 인덱스는 H2가 지원하지 않아 dev/prod가 갈린다(이미 겪은 함정).
-- 'P12' / 'E3' 문자열 한 칸으로 모으면 **한 제약으로 둘 다 막힌다.**
alter table platform_account add column owner_key varchar(24);

update platform_account set owner_key = 'P' || platform_id;

alter table platform_account alter column owner_key set not null;
alter table platform_account alter column platform_id drop not null;

alter table platform_account drop constraint uk_platform_account;
alter table platform_account
    add constraint uk_platform_account unique (member_id, owner_key, account_label);

-- 둘 중 정확히 하나. 애플리케이션 검증은 최선 노력이고 진짜 방어선은 여기다
alter table platform_account add constraint ck_platform_account_owner check (
    (platform_id is not null and emulator_id is null) or
    (platform_id is null and emulator_id is not null));
