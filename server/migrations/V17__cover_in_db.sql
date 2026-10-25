-- 커버를 DB에도 둔다 (v2, 2026-10-25).
--
-- 개인 커버는 한 달에 한두 장(장당 수백 KB)이다. DB 안에 두면 클라우드 백업(`/api/me/export`)과
-- 클라우드 → 로컬 세이브 뽑기에 커버가 같이 실린다 — 로컬 폴더(LOCAL)·스토리지(EXTERNAL)는 안 따라온다.
-- 어디에 둘지는 연결 설정이 정한다(`STARLOG_COVER_TARGET`). 이미 있는 LOCAL·EXTERNAL 행은 그대로 읽힌다.
--
--   DB        바이트가 이 행의 `data`에 있다. `storage_key`는 `<uuid>.<확장자>` — 바꿀 때마다 새로 지어 주소의 `?v=`가 된다
--   LOCAL     데이터 루트 `covers/<storage_key>`
--   EXTERNAL  S3 호환 스토리지의 `storage_key`
--
-- ⚠️ 실데이터(Neon)에서 처음 도는 파일이다. 모르는 위치 값이 있으면 고르지 않고 멈춘다 (아래 제약이 어차피 거절한다 — 이유를 먼저 보인다)
do $$
declare odd text;
begin
  select location into odd from cover_image where location not in ('LOCAL','EXTERNAL') limit 1;
  if odd is not null then
    raise exception 'V17 중단: 커버 위치 "%"를 모른다. 그 커버 행을 정리한 뒤 다시 열 것', odd;
  end if;
end $$;

alter table cover_image add column data bytea;

alter table cover_image add constraint chk_cover_image_location check (location in ('LOCAL','EXTERNAL','DB'));
-- 바이트는 DB 커버에만, DB 커버에는 반드시 — 반쪽(위치는 DB인데 바이트가 없다)이면 깨진 이미지가 뜨고 지우기 말고는 길이 없다
alter table cover_image add constraint chk_cover_image_data check ((location = 'DB') = (data is not null));
