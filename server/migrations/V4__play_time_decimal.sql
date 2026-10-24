-- 플레이 시간을 소수점 두 자리까지 (v1.0).
--
-- 왜 바꾸나 — 구글 캘린더의 플레이 세션 기록을 합산해 넣기로 했는데, 세션이 15분 단위라
-- 합계가 정수로 안 떨어진다(예: 1시간 45분 = 1.75시간). integer로 두면 반올림하는 순간
-- 원본이 사라지고, 나중에 세션 단위 기능을 붙일 때 숫자가 어긋난다.
--
-- 자리수는 rating(numeric(4,1))과 같은 결로 잡았다. 99999.99시간이면 11년치라 남는다.
--
-- integer -> numeric은 PostgreSQL·H2 둘 다 무손실 확대라 using 절이 필요 없다.
-- 인덱스(idx_backlog_member_play_time)는 타입이 바뀌어도 PostgreSQL이 알아서 재작성한다.
alter table backlog_entry
    alter column play_time_hours type numeric(7, 2);
