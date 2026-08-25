-- V2: 플랫폼·기기·에뮬레이터를 전역 마스터에서 **회원 소유**로 내리고,
--     입력 방식을 enum에서 테이블로 승격한다.
--
-- 왜 —
--   * 마스터는 모든 회원이 한 행을 공유해서, 이름 하나 고치려면 관리자 권한이 필요했다 (FR-ADM-04)
--   * 보유 기기(member_device)는 회차가 참조하지 않아 따로 놀았다. 추가해도 회차 선택지에 안 떴다
--   * 입력 방식이 enum 4개라 사용자가 늘릴 수 없었다
--
-- 데이터 이행 원칙 — **아무것도 잃지 않는다.**
--   1) 마스터 한 행 → 회원 수만큼 복제. 기존 참조는 "그 회원의 사본"으로 옮긴다
--   2) member_device의 라벨·메모는 대응하는 사본 기기의 이름으로 승격한다
--   3) 같은 기종을 두 대 이상 등록했으면 나머지는 독립된 기기 행으로 남긴다
--
-- 옮기는 동안 legacy_id에 원본 마스터 id를 들고 있다가 참조를 다 옮긴 뒤 떼어낸다.
-- H2(MODE=PostgreSQL)와 PostgreSQL 양쪽에서 도는 문법만 쓴다.

-- ============ 플랫폼 ============

create table tmp_platform_master as
select id, name from platform;

alter table platform add column member_id bigint;
alter table platform add column deleted_at timestamp(6);
alter table platform add column legacy_id bigint;
alter table platform drop constraint uk_platform_name;

insert into platform (name, member_id, legacy_id, created_at, updated_at)
select pm.name, m.id, pm.id, current_timestamp, current_timestamp
  from member m
 cross join tmp_platform_master pm;

update platform_account pa
   set platform_id = (select np.id
                        from platform np
                       where np.member_id = pa.member_id
                         and np.legacy_id = pa.platform_id)
 where pa.platform_id in (select id from tmp_platform_master);

update acquisition a
   set platform_id = (select np.id
                        from platform np, backlog_entry b
                       where b.id = a.backlog_entry_id
                         and np.member_id = b.member_id
                         and np.legacy_id = a.platform_id)
 where a.platform_id in (select id from tmp_platform_master);

delete from platform where member_id is null;

alter table platform alter column member_id set not null;
alter table platform drop column legacy_id;
alter table platform add constraint uk_platform unique (member_id, name);
alter table platform add constraint fk_platform_member
    foreign key (member_id) references member (id);

drop table tmp_platform_master;

-- ============ 에뮬레이터 ============

create table tmp_emulator_master as
select id, name from emulator;

alter table emulator add column member_id bigint;
alter table emulator add column memo text;
alter table emulator add column deleted_at timestamp(6);
alter table emulator add column legacy_id bigint;
alter table emulator drop constraint uk_emulator_name;

insert into emulator (name, member_id, legacy_id, created_at, updated_at)
select em.name, m.id, em.id, current_timestamp, current_timestamp
  from member m
 cross join tmp_emulator_master em;

update playthrough p
   set emulator_id = (select ne.id
                        from emulator ne, backlog_entry b
                       where b.id = p.backlog_entry_id
                         and ne.member_id = b.member_id
                         and ne.legacy_id = p.emulator_id)
 where p.emulator_id in (select id from tmp_emulator_master);

delete from emulator where member_id is null;

alter table emulator alter column member_id set not null;
alter table emulator drop column legacy_id;
alter table emulator add constraint uk_emulator unique (member_id, name);
alter table emulator add constraint fk_emulator_member
    foreign key (member_id) references member (id);

drop table tmp_emulator_master;

-- ============ 기기 (member_device 흡수) ============

create table tmp_device_master as
select id, name from device;

-- 같은 기종을 여러 대 등록했을 수 있다. 회차가 가리키는 건 기종(마스터)뿐이라
-- 어느 한 대로만 이어붙일 수 있고, 그 대표를 id가 가장 작은 것으로 고정한다
create table tmp_primary_device as
select md.member_id, md.device_id, md.label, md.memo
  from member_device md
 where md.label is not null
   and md.label <> ''
   and md.id = (select min(md2.id)
                  from member_device md2
                 where md2.member_id = md.member_id
                   and md2.device_id = md.device_id);

-- 대표로 뽑히지 못한 나머지. 독립된 기기 행으로 살려둔다
create table tmp_extra_device as
select md.member_id, md.device_id, md.label, md.memo
  from member_device md
 where md.label is not null
   and md.label <> ''
   and md.id > (select min(md2.id)
                  from member_device md2
                 where md2.member_id = md.member_id
                   and md2.device_id = md.device_id);

alter table device add column member_id bigint;
alter table device add column device_type varchar(50);
alter table device add column label varchar(50);
alter table device add column memo text;
alter table device add column deleted_at timestamp(6);
alter table device add column legacy_id bigint;
alter table device drop constraint uk_device_name;

-- 1) 마스터를 회원별로 복제. 라벨의 기본값은 기종 이름이다 (회차의 이사 대상)
--    name은 아직 not null이라 값을 채워야 한다. 아래에서 컬럼째 떼어낸다
insert into device (name, member_id, device_type, label, legacy_id, created_at, updated_at)
select dm.name, m.id, dm.name, dm.name, dm.id, current_timestamp, current_timestamp
  from member m
 cross join tmp_device_master dm;

-- 2) 보유 기기의 라벨·메모를 사본 위에 덮는다. "Nintendo Switch" → "거실 스위치"
--    라벨에 유니크가 걸리므로 같은 회원이 이미 쓰는 이름이면 기종 이름을 그대로 둔다
update device d
   set label = (select pd.label from tmp_primary_device pd
                 where pd.member_id = d.member_id and pd.device_id = d.legacy_id),
       memo  = (select pd.memo  from tmp_primary_device pd
                 where pd.member_id = d.member_id and pd.device_id = d.legacy_id)
 where exists (select 1 from tmp_primary_device pd
                where pd.member_id = d.member_id and pd.device_id = d.legacy_id)
   and not exists (select 1 from device d2
                    where d2.member_id = d.member_id
                      and d2.id <> d.id
                      and d2.label = (select pd.label from tmp_primary_device pd
                                       where pd.member_id = d.member_id
                                         and pd.device_id = d.legacy_id));

-- 3) 같은 기종의 두 번째 이후 보유 기기. 회차가 가리키지 않으므로 legacy_id 없이 선다
insert into device (name, member_id, device_type, label, memo, created_at, updated_at)
select dm.name, ed.member_id, dm.name, ed.label, ed.memo, current_timestamp, current_timestamp
  from tmp_extra_device ed
  join tmp_device_master dm on dm.id = ed.device_id
 where not exists (select 1 from device d2
                    where d2.member_id = ed.member_id and d2.label = ed.label);

update playthrough p
   set device_id = (select min(nd.id)
                      from device nd, backlog_entry b
                     where b.id = p.backlog_entry_id
                       and nd.member_id = b.member_id
                       and nd.legacy_id = p.device_id)
 where p.device_id in (select id from tmp_device_master);

drop table member_device;
delete from device where member_id is null;

alter table device alter column member_id set not null;
alter table device alter column device_type set not null;
alter table device alter column label set not null;
alter table device drop column name;
alter table device drop column legacy_id;
alter table device add constraint uk_device unique (member_id, label);
alter table device add constraint fk_device_member
    foreign key (member_id) references member (id);

drop table tmp_device_master;
drop table tmp_primary_device;
drop table tmp_extra_device;

-- ============ 입력 방식 (enum → 테이블) ============

create table input_method (
    id         bigint generated by default as identity primary key,
    member_id  bigint      not null,
    name       varchar(50) not null,
    deleted_at timestamp(6),
    created_at timestamp(6),
    updated_at timestamp(6),
    constraint uk_input_method unique (member_id, name),
    constraint fk_input_method_member foreign key (member_id) references member (id)
);

-- 예전 enum 상수 넷을 사람이 읽는 이름으로. DefaultCatalogSeeder의 목록과 같아야 한다
insert into input_method (member_id, name, created_at, updated_at)
select m.id, n.name, current_timestamp, current_timestamp
  from member m
 cross join (select '키보드 & 마우스' as name, 'KEYBOARD_MOUSE' as legacy
             union all select 'Xinput 패드', 'XINPUT'
             union all select '닌텐도 컨트롤러', 'NINTENDO'
             union all select '플레이스테이션 컨트롤러', 'PLAYSTATION') n;

alter table playthrough add column input_method_id bigint;

update playthrough p
   set input_method_id = (select im.id
                            from input_method im, backlog_entry b
                           where b.id = p.backlog_entry_id
                             and im.member_id = b.member_id
                             and im.name = case p.input_method
                                               when 'KEYBOARD_MOUSE' then '키보드 & 마우스'
                                               when 'XINPUT' then 'Xinput 패드'
                                               when 'NINTENDO' then '닌텐도 컨트롤러'
                                               when 'PLAYSTATION' then '플레이스테이션 컨트롤러'
                                           end)
 where p.input_method is not null;

alter table playthrough drop constraint chk_playthrough_input_method;
alter table playthrough drop column input_method;
alter table playthrough add constraint fk_playthrough_input_method
    foreign key (input_method_id) references input_method (id);

create index idx_playthrough_input_method on playthrough (input_method_id);
