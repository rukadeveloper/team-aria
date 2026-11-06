-- Team ARIA 초기 스키마
-- 설계 원칙
--  * 기존 XE 데이터를 여러 번 옮겨도 중복되지 않도록 legacy_* 칸(원래 XE 번호)을 둔다
--  * 회원 등급별 읽기·쓰기 권한은 앱 코드가 아니라 DB(RLS)가 강제한다
--  * 포인트·등급은 사용자가 직접 못 고치고, 함수(security definer)로만 바꾼다

create extension if not exists pg_trgm;

-- ───────── 등급 ─────────
create type member_grade as enum ('member', 'regular', 'team', 'admin');

create or replace function grade_rank(g member_grade) returns int
language sql immutable as $$
  select case g when 'member' then 1 when 'regular' then 2 when 'team' then 3 when 'admin' then 4 end
$$;

-- ───────── 회원 프로필 (로그인 정보는 auth.users) ─────────
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  grade member_grade not null default 'member',
  points integer not null default 0 check (points >= 0),
  avatar_url text,
  bio text,
  joined_at timestamptz not null default now(),
  -- XE 에서 옮겨온 회원이면 원래 번호·아이디 (비밀번호는 옮기지 않고 재설정하게 함)
  legacy_member_srl bigint unique,
  legacy_user_id text,
  claimed_at timestamptz
);
create unique index profiles_nickname_key on profiles (lower(nickname));

create or replace function current_grade() returns member_grade
language sql stable security definer set search_path = public as $$
  select grade from profiles where id = auth.uid()
$$;

-- 로그인한 사용자가 board 의 필요 등급 이상인지 (null = 누구나)
create or replace function meets_grade(required member_grade) returns boolean
language sql stable security definer set search_path = public as $$
  select required is null
      or coalesce(grade_rank((select grade from profiles where id = auth.uid())), 0) >= grade_rank(required)
$$;

-- ───────── 게시판 ─────────
create table boards (
  id serial primary key,
  slug text not null unique,
  title text not null,
  description text,
  -- 메뉴 묶음: team / community / works / official
  grp text not null,
  sort integer not null default 0,
  -- 필요 등급. read_grade 가 null 이면 비회원도 읽을 수 있음
  read_grade member_grade,
  write_grade member_grade not null default 'member',
  comment_grade member_grade not null default 'member',
  -- 첨부 다운로드에 포인트가 드는 게시판인지
  allow_attachments boolean not null default true,
  legacy_module_srl bigint unique
);

-- ───────── 글 ─────────
create table posts (
  id bigint generated always as identity primary key,
  board_id integer not null references boards (id) on delete cascade,
  author_id uuid references profiles (id) on delete set null,
  -- 탈퇴·미이전 회원의 글에 보여줄 이름
  author_name text not null,
  title text not null check (char_length(title) between 1 and 200),
  -- 본문은 HTML 이라 화면에 그릴 때 반드시 sanitize
  content text not null,
  is_notice boolean not null default false,
  view_count integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_document_srl bigint unique
);
create index posts_board_list on posts (board_id, is_notice desc, created_at desc);
create index posts_author on posts (author_id);
create index posts_title_trgm on posts using gin (title gin_trgm_ops);

-- ───────── 댓글 ─────────
create table comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts (id) on delete cascade,
  parent_id bigint references comments (id) on delete cascade,
  author_id uuid references profiles (id) on delete set null,
  author_name text not null,
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  legacy_comment_srl bigint unique
);
create index comments_post on comments (post_id, created_at);

-- ───────── 첨부파일 (파일 자체는 Supabase Storage 'attachments' 버킷) ─────────
create table attachments (
  id bigint generated always as identity primary key,
  post_id bigint not null references posts (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  size_bytes bigint not null default 0,
  mime_type text,
  download_count integer not null default 0,
  -- 받을 때 차감되는 포인트 (0 = 무료)
  point_cost integer not null default 0 check (point_cost >= 0),
  legacy_file_srl bigint unique
);
create index attachments_post on attachments (post_id);

-- ───────── 포인트 내역 ─────────
create table point_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  delta integer not null,
  reason text not null,
  -- 같은 사유를 중복 지급하지 않기 위한 키 (예: 'attend:2026-11-06')
  ref text,
  created_at timestamptz not null default now()
);
create unique index point_logs_once on point_logs (user_id, reason, ref) where ref is not null;
create index point_logs_user on point_logs (user_id, created_at desc);

-- ───────── 포인트 지급·차감 (직접 update 불가, 이 함수만) ─────────
create or replace function apply_points(p_user uuid, p_delta integer, p_reason text, p_ref text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare new_points integer;
begin
  if p_ref is not null and exists (
    select 1 from point_logs where user_id = p_user and reason = p_reason and ref = p_ref
  ) then
    return (select points from profiles where id = p_user);   -- 이미 지급됨
  end if;
  update profiles set points = points + p_delta where id = p_user and points + p_delta >= 0
    returning points into new_points;
  if new_points is null then
    raise exception '포인트가 부족합니다.' using errcode = 'P0001';
  end if;
  insert into point_logs (user_id, delta, reason, ref) values (p_user, p_delta, p_reason, p_ref);
  return new_points;
end $$;
revoke all on function apply_points(uuid, integer, text, text) from public, anon, authenticated;

-- 출석 체크: 하루 한 번 포인트 (서버가 날짜를 정하므로 조작 불가)
create or replace function attend() returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); today text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD');
begin
  if uid is null then raise exception '로그인이 필요합니다.' using errcode = '28000'; end if;
  return apply_points(uid, 10, 'attend', today);
end $$;
grant execute on function attend() to authenticated;

-- ───────── 댓글 수 유지 ─────────
create or replace function bump_comment_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then update posts set comment_count = comment_count + 1 where id = new.post_id;
  else update posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id; end if;
  return null;
end $$;
create trigger comments_count after insert or delete on comments for each row execute function bump_comment_count();

-- ───────── 프로필 보호: 등급·포인트는 관리자만 바꿈 ─────────
-- 주의: security definer 가 아니다. 그래야 current_user 가 요청한 쪽의 역할(anon/authenticated)로 보이고,
-- security definer 함수(apply_points 등) 안에서는 함수 소유자로 보여 통과한다
create or replace function protect_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and coalesce(current_grade(), 'member') <> 'admin' then
    if new.grade is distinct from old.grade or new.points is distinct from old.points
       or new.legacy_member_srl is distinct from old.legacy_member_srl then
      raise exception '변경할 수 없는 항목입니다.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on profiles for each row execute function protect_profile();

-- 가입하면 프로필을 자동으로 만든다 (닉네임은 가입 때 메타데이터로 받음)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nickname)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), 'user_' || substr(new.id::text, 1, 8)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ───────── RLS ─────────
alter table profiles enable row level security;
alter table boards enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table attachments enable row level security;
alter table point_logs enable row level security;

create policy profiles_read on profiles for select using (true);
create policy profiles_update_own on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy boards_read on boards for select using (true);
create policy boards_admin on boards for all using (current_grade() = 'admin') with check (current_grade() = 'admin');

create policy posts_read on posts for select using (
  exists (select 1 from boards b where b.id = posts.board_id and meets_grade(b.read_grade))
);
create policy posts_insert on posts for insert with check (
  author_id = auth.uid()
  and exists (select 1 from boards b where b.id = posts.board_id and meets_grade(b.write_grade))
);
create policy posts_update on posts for update
  using (author_id = auth.uid() or current_grade() = 'admin')
  with check (author_id = auth.uid() or current_grade() = 'admin');
create policy posts_delete on posts for delete using (author_id = auth.uid() or current_grade() = 'admin');

create policy comments_read on comments for select using (
  exists (select 1 from posts p join boards b on b.id = p.board_id where p.id = comments.post_id and meets_grade(b.read_grade))
);
create policy comments_insert on comments for insert with check (
  author_id = auth.uid()
  and exists (select 1 from posts p join boards b on b.id = p.board_id where p.id = comments.post_id and meets_grade(b.comment_grade))
);
create policy comments_delete on comments for delete using (author_id = auth.uid() or current_grade() = 'admin');

-- 첨부 목록은 글을 볼 수 있으면 보인다 (실제 파일 받기는 서버가 포인트를 확인한 뒤 서명 URL 로)
create policy attachments_read on attachments for select using (
  exists (select 1 from posts p join boards b on b.id = p.board_id where p.id = attachments.post_id and meets_grade(b.read_grade))
);
create policy attachments_write on attachments for all
  using (exists (select 1 from posts p where p.id = attachments.post_id and (p.author_id = auth.uid() or current_grade() = 'admin')))
  with check (exists (select 1 from posts p where p.id = attachments.post_id and (p.author_id = auth.uid() or current_grade() = 'admin')));

create policy point_logs_own on point_logs for select using (user_id = auth.uid());

-- ───────── 기본 게시판 ─────────
insert into boards (slug, title, grp, sort, read_grade, write_grade, comment_grade) values
  ('notice',     '공지사항',        'team',      10, null,      'admin',   'member'),
  ('request',    '작품신청',        'team',      20, null,      'member',  'member'),
  ('qna',        '질문/건의',       'team',      30, null,      'member',  'member'),
  ('archive',    '자료실',          'team',      40, 'member',  'team',    'member'),
  ('free',       '자유게시판',      'community', 10, null,      'member',  'member'),
  ('humor',      '유머게시판',      'community', 20, null,      'member',  'member'),
  ('radio',      '라디오',          'community', 30, null,      'member',  'member'),
  ('attendance', '출석부',          'community', 40, 'member',  'member',  'member'),
  ('rankup',     '승급 신청',       'community', 50, 'member',  'member',  'member'),
  ('event',      '이벤트',          'community', 60, null,      'team',    'member'),
  ('works',      '작품 게시판',     'works',     10, null,      'member',  'member'),
  ('collab',     '합작 게시판',     'works',     20, 'regular', 'regular', 'regular'),
  ('official',   '팀 더빙 작품',    'official',  10, null,      'team',    'member'),
  ('team-radio', '팀 라디오',       'official',  20, null,      'team',    'member'),
  ('unit',       '팀 유닛 작품',    'official',  30, null,      'team',    'member'),
  ('toon',       '아리아툰',        'official',  40, null,      'team',    'member');
