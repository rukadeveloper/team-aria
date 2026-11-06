-- 기존 홈페이지(team-aria.net)를 수집해 옮길 때 필요한 칸

-- 게시판: 기존 주소 이름(mid)
alter table boards add column if not exists legacy_mid text unique;

-- 글: 해시태그, 기존 분류, 기존 글쓴이 번호
--  * 글쓴이 번호(legacy_author_srl): 회원 데이터를 옮기지 않으므로, 나중에 같은 사람이 가입했을 때 글을 연결하는 데 쓴다
alter table posts add column if not exists tags text[] not null default '{}';
alter table posts add column if not exists legacy_category text;
alter table posts add column if not exists legacy_author_srl bigint;
-- 작품 글의 제작진 표(노래·녹음·믹싱·가사·번역·공개일 …)와 대표 이미지 등 글 종류별 추가 정보
alter table posts add column if not exists meta jsonb not null default '{}';
create index if not exists posts_legacy_author on posts (legacy_author_srl) where legacy_author_srl is not null;
create index if not exists posts_tags on posts using gin (tags);

alter table comments add column if not exists legacy_author_srl bigint;

-- 첨부파일: 아직 새 저장소로 옮기지 않은 파일은 기존 주소만 가진다 (storage_path 는 나중에 채운다)
alter table attachments alter column storage_path drop not null;
alter table attachments add column if not exists source_url text;
alter table attachments add constraint attachments_has_file check (storage_path is not null or source_url is not null);
