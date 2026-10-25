-- 스크린샷 폴더 이름은 게임마다 하나 (v2, 2026-10-25, 보안 조사).
--
-- 폴더 = 그 게임의 스크린샷 목록이라, 두 게임이 같은 폴더를 잡으면 한쪽에서 지운 파일이 다른 쪽에서도 사라진다.
-- 앱 코드(`uniqueMediaSlug`)가 이미 피하지만, 동시 요청 둘이 같은 이름을 고르는 틈은 DB만 막을 수 있다.
-- 아직 폴더가 없는 게임(null)은 여럿이어도 된다 — 부분 유니크.
--
-- ⚠️ 실데이터(Neon)에서 처음 도는 파일이다. 이미 겹친 게 있으면 고르지 않고 멈춘다 (어느 쪽 폴더인지 사람만 안다)
do $$
declare dup text;
begin
  select media_folder into dup from game where media_folder is not null
   group by media_folder having count(*) > 1 limit 1;
  if dup is not null then
    raise exception 'V16 중단: 스크린샷 폴더 "%"를 게임 둘 이상이 쓴다. 한쪽 게임의 폴더를 정리한 뒤 다시 열 것', dup;
  end if;
end $$;

create unique index uk_game_media_folder on game (media_folder) where media_folder is not null;
