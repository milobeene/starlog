-- V3: 가입 승인제 (FR-ADM-06).
--
-- 무료 티어로 배포하는 서비스라 아무나 가입하면 DB·스토리지 용량이 먼저 터진다.
-- 가입은 열어두되 관리자가 승인해야 로그인이 되게 한다.
--
-- ⚠️ **기존 회원은 전부 승인 처리한다.** 안 그러면 이 마이그레이션이 도는 순간
-- 나를 포함한 모든 기존 사용자가 로그인 403이 되어 잠긴다.
-- 승인 시각은 가입 시각으로 소급한다 — "언제부터 쓰던 사람인가"가 그게 더 정확하다.

alter table member add column approved_at timestamp(6);

update member set approved_at = coalesce(created_at, current_timestamp);

-- 대기 목록 조회용. 승인된 회원이 대부분이 되므로 null만 걸러내는 인덱스가 유리하지만,
-- 부분 인덱스는 H2(dev)가 지원하지 않아 일반 인덱스로 둔다
create index idx_member_approved_at on member (approved_at);
