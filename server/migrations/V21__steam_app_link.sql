-- 스팀 앱 ↔ STARLOG 항목 연결 (v2.2, 2026-10-31). 계약 `scratchpad/ingest/steam-links.md`.
--
-- 외부 스크린샷 폴더의 스팀 앱(appid)이 어느 항목인지 기억한다. 지금까지는 일렉트론 `settings.json`의
-- `steamGameMap`에만 있었다 — 백업에 안 실리고 자동 맞춤도 없었다.
--
--   source  AUTO   IGDB external_games(Steam uid)로 맞춘 것. 항목이 사라지면 다음 조회 때 다시 맞춘다
--           MANUAL 사용자가 고른 것. AUTO가 절대 덮어쓰지 않는다 (백업에 실린다)
--           NONE   IGDB에 물어봤는데 없음 (음성 캐시) — checked_at 7일 뒤 다시 확인
--
-- 항목을 **하드 삭제**하면 backlog_entry_id만 null로(on delete set null) — 행은 남아 AUTO면 다시 맞추고 MANUAL이면 끊긴 채 남는다.
-- 소프트 삭제(휴지통)는 조회 때 deleted_at으로 거른다.
create table steam_app_link (
    -- 숫자만. 스팀 앱 번호는 32비트지만 비스팀 바로가기 번호가 더 크다 — 20자리까지 받고 조회 쪽에서 거른다
    appid            varchar(20) primary key,
    backlog_entry_id bigint,
    igdb_game_id     bigint,
    source           varchar(10) not null,
    checked_at       timestamp(6),
    created_at       timestamp(6),
    updated_at       timestamp(6),
    constraint chk_steam_app_link_appid check (appid ~ '^[0-9]{1,20}$'),
    constraint chk_steam_app_link_source check (source in ('AUTO','MANUAL','NONE')),
    constraint fk_steam_app_link_entry foreign key (backlog_entry_id) references backlog_entry (id) on delete set null
);

create index idx_steam_app_link_entry on steam_app_link (backlog_entry_id);
