-- owner_key 정합성 (v1.2, 2026-08-30).
--
-- V11이 `owner_key`('P12' / 'E3')로 유니크를 모았다. nullable 컬럼이 섞인 유니크는
-- PostgreSQL도 H2도 NULL을 서로 다른 값으로 봐서 중복을 못 막기 때문이다.
--
-- ⚠️ **그런데 owner_key가 실제 소속과 같은지는 아무도 안 봤다.** 애플리케이션이
-- `moveTo`를 안 거치고 컬럼만 바꾸면 'P12'인데 platform_id가 13인 행이 생기고,
-- 그 순간 uk_platform_account가 **조용히 무력해진다** — 같은 플랫폼에 같은 라벨이
-- 두 번 들어가도 키가 다르니 통과한다. 유니크가 진짜 방어선이 되려면(JPA 원칙 7)
-- 그 재료가 거짓이 아님을 DB가 지켜야 한다.
--
-- 기존 행은 V11이 'P' || platform_id로 채웠으므로 이 식과 이미 일치한다.
alter table platform_account add constraint ck_platform_account_owner_key check (
    owner_key = case when platform_id is not null
                     then 'P' || platform_id
                     else 'E' || emulator_id end);
