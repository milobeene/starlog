-- homeops 일정을 STARLOG 일반 기록(ADD)으로 넘기는 함수 (v2, 2026-10-25). 인수인계 homeops 쪽 §3이 기대는 계약:
--   homeops_release(keys text[]) returns integer  — 옮긴 행 수. 없는 키는 무시, 두 번 불러도 두 번째는 0
--
-- homeops 계정은 `play_record`에 권한이 없다 → **소유자 권한으로 돈다(security definer).** 그래서 몸통이 하는 일을 좁게 묶는다:
-- 넘겨받은 키의 **끝난** 일정만 지우고 같은 분을 ADD로 넣는다. 합계는 그대로라(끝난 일정 몫 = ADD 몫) 캐시를 다시 맞출 필요가 없다.
--
-- 표 이름은 만들 때의 스키마로 박는다 + search_path는 pg_catalog·pg_temp만 — security definer에서
-- 부르는 쪽이 같은 이름의 임시 표·함수로 가로채지 못하게 하는 습관이다.
-- 시각: 앱 시계를 못 쓰는 SQL 안이라 `now() at time zone 'Asia/Seoul'`로 KST 벽시계를 만든다 (세션 시간대와 무관하다)
-- 0분 일정은 지우기만 한다 — ADD는 0보다 커야 한다(chk_play_record_add_positive). 합계는 어차피 같다
do $do$
declare s text := quote_ident(current_schema());
begin
  execute format($f$
    create function %1$s.homeops_release(keys text[])
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
        returning backlog_entry_id, started_at, minutes, label
      )
      insert into %1$s.play_record (backlog_entry_id, kind, minutes, played_on, note, created_at, updated_at)
      select backlog_entry_id, 'ADD', minutes, started_at::date,
             left(coalesce(label || ' · ', '') || '일정에서 넘김', 100), kst, kst
        from moved
       where minutes > 0;
      get diagnostics n = row_count;
      return n;
    end
    $body$
  $f$, s);
  -- 기본은 누구나 실행할 수 있다 — 막고, homeops 계정에만 기동 때 연다 (`startup.ts`)
  execute format('revoke all on function %s.homeops_release(text[]) from public', s);
end
$do$;
