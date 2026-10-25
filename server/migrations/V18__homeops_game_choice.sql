-- homeops가 게임을 고를 때 보는 창 (v2, 2026-10-25). 인수인계 `docs/homeops-handoff.md` §5.
--
-- homeops 계정(`homeops_writer`)에는 **이 뷰와 `homeops_play_log`만** 연다 — 메모·구매·회차 같은 건 안 보이게.
-- 뷰는 소유자 권한으로 돌아서 homeops 계정에 `backlog_entry`·`game` 읽기 권한을 줄 필요가 없다.
--
-- 권한(grant)은 여기 넣지 않는다 — 계정은 비밀번호가 붙어 콘솔에서 만들고(공개 저장소라 코드에 못 둔다),
-- 계정이 없는 DB(로컬 세이브)에서 grant가 터지면 세이브가 안 열린다. 기동 때 계정이 있으면 그때 준다 (`startup.ts`)
create view homeops_game_choice as
select b.id              as entry_id,
       b.display_name    as name,
       b.status,
       b.last_played_on,
       b.play_time_hours,
       g.cover_image_id
  from backlog_entry b
  join game g on g.id = b.game_id
 where b.deleted_at is null;
