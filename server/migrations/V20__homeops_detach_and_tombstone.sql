-- homeops 연결 끊기 + 넘긴 일정의 묘비 (v2, 2026-10-25). 인수인계 `docs/homeops-handoff.md` "V20".
--
-- 1) `detached_at` — homeops에서 "연결만 끊기"를 하면 homeops가 이 칸을 채우고 그 행을 다시는 안 건드린다.
--    그 뒤 정리(일반 기록으로 넘기기·지우기)는 STARLOG 화면에서만 한다 — 이 표에 STARLOG가 쓰는 유일한 예외다.
-- 2) `homeops_released` — 넘기거나 지운 일정의 `external_id`. homeops가 같은 일정을 다시 올리면
--    (동기화 재시도·옛 캐시) 이미 ADD로 넘어간 시간이 **두 번** 더해진다 → 트리거가 23514로 막는다.
--    homeops 계정에는 이 표 권한을 주지 않는다 — 트리거 함수가 소유자 권한으로 본다.
--
-- 표 이름은 만들 때의 스키마로 박는다 + search_path는 pg_catalog·pg_temp만 (V19와 같은 이유)
alter table homeops_play_log add column detached_at timestamp(6);

create table homeops_released (
    external_id varchar(200) primary key,
    released_at timestamp(6) not null
);

do $do$
declare s text := quote_ident(current_schema());
begin
  -- 제약 이름을 실어 보낸다 — homeops가 일반 check 위반(같은 23514)과 갈라 볼 수 있게
  execute format($f$
    create function %1$s.homeops_block_released()
    returns trigger
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $body$
    begin
      if exists (select 1 from %1$s.homeops_released r where r.external_id = new.external_id) then
        raise exception 'STARLOG로 이미 넘기거나 지운 일정입니다: %%', new.external_id
          using errcode = '23514', constraint = 'homeops_released',
                hint = '이 일정은 다시 올리지 말고 homeops 쪽에서 연결을 지우세요';
      end if;
      return new;
    end
    $body$
  $f$, s);
  execute format('revoke all on function %s.homeops_block_released() from public', s);

  -- before insert라 `insert … on conflict do update`도 막힌다 — 충돌 판정보다 먼저 돈다 (의도한 것)
  execute format('create trigger trg_homeops_block_released before insert on %1$s.homeops_play_log
                  for each row execute function %1$s.homeops_block_released()', s);

  -- V19를 갈아 끼운다 — 지운 행마다(0분도) 묘비를 남기고, 반환 뜻이 "옮긴 행 수" → "묘비가 있는 키 수"로 바뀐다.
  -- 서명·반환 형이 같아서 기존 실행 권한이 그대로 남는다
  execute format($f$
    create or replace function %1$s.homeops_release(keys text[])
    returns integer
    language plpgsql
    security definer
    set search_path = pg_catalog, pg_temp
    as $body$
    declare
      kst timestamp := (now() at time zone 'Asia/Seoul')::timestamp(6);
      n integer;
    begin
      with moved as (
        delete from %1$s.homeops_play_log
         where external_id = any(keys) and ended_at <= kst
        returning backlog_entry_id, external_id, started_at, minutes, label
      ), tomb as (
        insert into %1$s.homeops_released (external_id, released_at)
        select external_id, kst from moved
        on conflict do nothing
      )
      insert into %1$s.play_record (backlog_entry_id, kind, minutes, played_on, note, created_at, updated_at)
      select backlog_entry_id, 'ADD', minutes, started_at::date,
             left(coalesce(label || ' · ', '') || '일정에서 넘김', 100), kst, kst
        from moved
       where minutes > 0;
      -- 반환 = 호출 뒤 묘비가 있는 **서로 다른** 입력 키 수 (이번에 옮김 + 0분 + 예전에 이미 옮김).
      -- homeops는 "반환 < 키 수"를 부분 실패로 보고 되돌린다 — 첫 호출이 늦게 커밋된 뒤 재시도가 0을 받으면 안 된다.
      -- 어디에도 없는 키·안 끝난 일정은 안 센다
      select count(distinct k) into n from unnest(keys) k
       where exists (select 1 from %1$s.homeops_released r where r.external_id = k);
      return n;
    end
    $body$
  $f$, s);
  execute format('revoke all on function %s.homeops_release(text[]) from public', s);
end
$do$;
