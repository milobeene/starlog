-- 태그 순서 (v1.1, 2026-08-29).
--
-- 사용자가 사전에서 드래그로 순서를 정하면 **라이브러리 사이드바와 폴더 탭이 그 순서를 따른다.**
-- 지금까지는 이름순(localeCompare)이었는데, 자주 보는 태그를 위로 올릴 방법이 없었다.
--
-- ⚠️ **기존 행에 값을 채운 뒤에 NOT NULL을 건다.** 순서를 뒤집으면 이미 있는 행이
-- null이라 제약에 걸려 마이그레이션이 통째로 실패한다.
-- 초기값을 id로 두는 이유 — 만든 순서가 사용자가 마지막으로 본 순서와 가장 가깝다.
-- 이름순으로 채우면 지금 화면과 달라져서 "왜 순서가 바뀌었지"가 된다.
alter table tag add column sort_order int;

update tag set sort_order = id;

alter table tag alter column sort_order set not null;

-- 회원별로 순서를 읽는다. member_id가 앞이라 그 회원의 태그만 훑고 끝난다
create index idx_tag_member_order on tag (member_id, sort_order);
