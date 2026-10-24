-- 게임 소개문의 한국어 번역 (v1.0, 2026-08-28).
--
-- ## 원문을 지우지 않는다
--
-- `summary`는 그대로 두고 칸을 하나 더 만든다. 두 가지 이유다:
--   1. 번역이 이상할 때 원문을 볼 수 있어야 한다 (화면이 [원문] 토글을 준다)
--   2. 다시 번역하려면 원문이 있어야 한다 — 덮어썼으면 되돌릴 방법이 없다
--
-- ## storyline은 번역하지 않는다
--
-- IGDB 2,000건 실측에서 summary는 최대 3,254자인데 **storyline은 20,764자**였다.
-- 그것까지 번역하면 게임 하나가 월 무료 한도(50만 자)의 4%를 먹는다.
-- 소개를 읽는 목적에는 summary로 충분하고, 값이 값을 못 한다.
alter table game add column summary_ko text;

-- 언제 번역했나. 원문이 바뀌면(재동기화) 번역이 낡으므로 그 판단에 쓴다
alter table game add column summary_translated_at timestamp(6);
