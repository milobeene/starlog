-- 앱 설정 (v1.0, 2026-08-28).
--
-- ## 왜 DB인가
--
-- architecture §2의 경계표가 이미 답을 갖고 있었다 — **기준은 "재시작이 필요한가"다.**
-- DB·스토리지는 부팅 때 조립되므로 일렉트론(`connections.json`)이 갖고,
-- **IGDB 키는 런타임에 바꿔도 되므로 앱 안**이다. 그런데 그 자리를 안 만들어서
-- 키가 연결 설정에만 있었고, 그 결과 **로컬 모드에서는 IGDB를 아예 못 썼다.**
--
-- DB에 두면 로컬이든 클라우드든 "지금 열린 기록"에 딸려 다니고, 앱 안에서 바꾸면 즉시 먹는다.
--
-- ## 키-값 한 테이블
--
-- 설정마다 컬럼을 늘리면 그때마다 마이그레이션이 하나씩 는다. 지금 담을 것이 두 줄뿐이고
-- 앞으로 늘어도 성격이 같아서(문자열 하나) 굳이 나눌 이유가 없다.
create table app_setting (
    setting_key   varchar(100) primary key,
    setting_value text,
    created_at    timestamp(6),
    updated_at    timestamp(6)
);
