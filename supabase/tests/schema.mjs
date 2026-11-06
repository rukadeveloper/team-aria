import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 메모리 안의 Postgres(PGlite)로 스키마·RLS 를 시험한다. 실행: npm run test:db

const db = new PGlite({ extensions: { pg_trgm } });
// 마이그레이션을 번호 순서대로 모두 적용한다
const migDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const sql = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(migDir + f, 'utf8')).join('\n');

// Supabase 가 기본 제공하는 것들의 대역: auth.users, auth.uid(), 역할
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  create role anon; create role authenticated;
  grant usage on schema public, auth to anon, authenticated;
`);
await db.exec(sql);
await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated;
               grant usage, select on all sequences in schema public to anon, authenticated;`);

const ok = [], bad = [];
const check = (name, cond, extra = '') => (cond ? ok : bad).push(name + (extra ? ` (${extra})` : ''));
const as = async (uid, role, fn) => {
  await db.exec(`set role ${role}; select set_config('request.uid', '${uid ?? ''}', false)`);
  try { return await fn(); } finally { await db.exec('reset role'); }
};
const fails = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

// 사용자: 일반, 정회원, 팀원, 관리자
const mk = async (nick, grade) => {
  const r = await db.query(`insert into auth.users (raw_user_meta_data) values ('{"nickname":"${nick}"}') returning id`);
  const id = r.rows[0].id;
  await db.exec(`update profiles set grade='${grade}' where id='${id}'`);
  return id;
};
const member = await mk('일반', 'member'), regular = await mk('정회원', 'regular'), team = await mk('팀원', 'team'), admin = await mk('관리자', 'admin');
check('가입하면 프로필 자동 생성', (await db.query('select count(*)::int n from profiles')).rows[0].n === 4);

const board = async (slug) => (await db.query('select id from boards where slug=$1', [slug])).rows[0].id;
const [free, notice, collab, official] = [await board('free'), await board('notice'), await board('collab'), await board('official')];
check('기본 게시판 16개', (await db.query('select count(*)::int n from boards')).rows[0].n === 16);

// 글쓰기 권한
const ins = (uid, role, bid, title = '제목') => as(uid, role, () => db.query(`insert into posts (board_id, author_id, author_name, title, content) values (${bid}, '${uid}', 'x', '${title}', '<p>내용</p>')`));
check('일반회원 자유게시판 글쓰기 허용', (await fails(() => ins(member, 'authenticated', free))) === null);
check('일반회원 공지 글쓰기 차단', (await fails(() => ins(member, 'authenticated', notice))) !== null);
check('관리자 공지 글쓰기 허용', (await fails(() => ins(admin, 'authenticated', notice, '공지'))) === null);
check('일반회원 팀작품 글쓰기 차단', (await fails(() => ins(member, 'authenticated', official))) !== null);
check('팀원 팀작품 글쓰기 허용', (await fails(() => ins(team, 'authenticated', official, '더빙'))) === null);
check('타인 명의로 글쓰기 차단', (await fails(() => as(member, 'authenticated', () => db.query(`insert into posts (board_id, author_id, author_name, title, content) values (${free}, '${admin}', 'x', 't', 'c')`)))) !== null);

// 읽기 권한 (합작 게시판은 정회원 이상)
await ins(regular, 'authenticated', collab, '합작글');
const count = (uid, role) => as(uid, role, async () => (await db.query(`select count(*)::int n from posts where board_id=${collab}`)).rows[0].n);
check('비회원은 합작글 못 봄', (await count(null, 'anon')) === 0);
check('일반회원은 합작글 못 봄', (await count(member, 'authenticated')) === 0);
check('정회원은 합작글 봄', (await count(regular, 'authenticated')) === 1);
const pub = await as(null, 'anon', async () => (await db.query(`select count(*)::int n from posts where board_id in (${notice}, ${free})`)).rows[0].n);
check('비회원도 공지·자유글은 봄', pub === 2, `본 글 ${pub}개`);

// 댓글 + 댓글 수 트리거 + 합작 댓글 권한
const postId = (await db.query(`select id from posts where title='제목' limit 1`)).rows[0].id;
await as(member, 'authenticated', () => db.query(`insert into comments (post_id, author_id, author_name, content) values (${postId}, '${member}', 'x', '안녕')`));
check('댓글 수 자동 증가', (await db.query(`select comment_count from posts where id=${postId}`)).rows[0].comment_count === 1);
const collabPost = (await db.query(`select id from posts where board_id=${collab} limit 1`)).rows[0].id;
check('일반회원 합작 댓글 차단', (await fails(() => as(member, 'authenticated', () => db.query(`insert into comments (post_id, author_id, author_name, content) values (${collabPost}, '${member}', 'x', 'hi')`)))) !== null);

// 프로필 보호
check('본인 등급 올리기 차단', (await fails(() => as(member, 'authenticated', () => db.query(`update profiles set grade='admin' where id='${member}'`)))) !== null);
check('본인 포인트 올리기 차단', (await fails(() => as(member, 'authenticated', () => db.query(`update profiles set points=99999 where id='${member}'`)))) !== null);
check('닉네임 변경은 허용', (await fails(() => as(member, 'authenticated', () => db.query(`update profiles set nickname='새닉' where id='${member}'`)))) === null);
check('남의 프로필 수정 불가', (await as(member, 'authenticated', () => db.query(`update profiles set bio='해킹' where id='${admin}' returning id`))).rows.length === 0);
check('apply_points 직접 호출 차단', (await fails(() => as(member, 'authenticated', () => db.query(`select apply_points('${member}', 100, 'cheat')`)))) !== null);

// 출석 (하루 한 번)
const a1 = await as(member, 'authenticated', async () => (await db.query('select attend() p')).rows[0].p);
const a2 = await as(member, 'authenticated', async () => (await db.query('select attend() p')).rows[0].p);
check('출석 10포인트 지급', a1 === 10, `p=${a1}`);
check('같은 날 중복 출석은 추가 지급 없음', a2 === 10, `p=${a2}`);
check('비회원 출석 차단', (await fails(() => as(null, 'anon', () => db.query('select attend()')))) !== null);
check('포인트 부족 시 차감 거부', (await fails(() => db.query(`select apply_points('${member}', -500, 'buy')`))) !== null);

// 옛 번호로 중복 가져오기 방지
await db.query(`insert into posts (board_id, author_name, title, content, legacy_document_srl) values (${free}, '옛회원', '옛글', '<p>x</p>', 777)`);
check('legacy 번호 중복 가져오기 차단', (await fails(() => db.query(`insert into posts (board_id, author_name, title, content, legacy_document_srl) values (${free}, 'a', 't', 'c', 777)`))) !== null);

// ───── 수집한 데이터를 넣을 때 (0002): load-crawl.mjs 가 하는 SQL 과 같은 동작 ─────
const works = await board('works');
const upsertPost = (srl, title) => db.query(
  `insert into posts (board_id, author_id, author_name, legacy_author_srl, title, content, tags, legacy_category, view_count, created_at, legacy_document_srl)
   values (${works}, null, '글쓴이', 123, $1, '<p>본문</p>', '{개사,ost}', '분류', 77, '2016-05-22T00:00:00Z', $2)
   on conflict (legacy_document_srl) do update set title = excluded.title, view_count = excluded.view_count returning id`, [title, srl]);
const first = await upsertPost(9001, '수집한 글');
const again = await upsertPost(9001, '수집한 글(수정)');
check('수집한 글 다시 넣어도 한 건만 (중복 없음)', first.rows[0].id === again.rows[0].id && (await db.query('select count(*)::int n from posts where legacy_document_srl=9001')).rows[0].n === 1);
check('다시 넣으면 내용이 갱신됨', (await db.query('select title from posts where legacy_document_srl=9001')).rows[0].title === '수집한 글(수정)');
check('작성자 계정 없이 이름·기존 번호만으로 저장', (await db.query('select author_id, author_name, legacy_author_srl from posts where legacy_document_srl=9001')).rows[0].author_id === null);
check('해시태그 저장·검색', (await db.query(`select count(*)::int n from posts where tags @> '{개사}'`)).rows[0].n >= 1);
const pid = first.rows[0].id;
const addComment = (srl, parent) => db.query(`insert into comments (post_id, parent_id, author_name, content, legacy_comment_srl) values (${pid}, ${parent ?? 'null'}, 'c', '댓글', ${srl}) on conflict (legacy_comment_srl) do update set content = excluded.content returning id`);
const c1 = (await addComment(5001)).rows[0].id;
await addComment(5001); // 재실행
const c2 = (await addComment(5002)).rows[0].id;
await db.query(`update comments set parent_id = ${c1} where id = ${c2}`);
check('댓글 다시 넣어도 중복 없음, 댓글 수는 2', (await db.query(`select comment_count from posts where id=${pid}`)).rows[0].comment_count === 2);
check('대댓글 부모 연결', (await db.query(`select parent_id from comments where id=${c2}`)).rows[0].parent_id === c1);
check('부모 댓글을 지우면 대댓글도 함께 삭제', (await (async () => { await db.query(`delete from comments where id=${c1}`); return (await db.query(`select count(*)::int n from comments where id=${c2}`)).rows[0].n; })()) === 0);
check('첨부: 기존 주소만 있어도 저장', (await fails(() => db.query(`insert into attachments (post_id, storage_path, source_url, file_name, legacy_file_srl) values (${pid}, null, 'http://x/y', 'a.jpg', 1)`))) === null);
check('첨부: 파일 위치가 하나도 없으면 거부', (await fails(() => db.query(`insert into attachments (post_id, storage_path, source_url, file_name) values (${pid}, null, null, 'b.jpg')`))) !== null);
const anonSees = await as(null, 'anon', async () => (await db.query(`select count(*)::int n from posts where legacy_document_srl=9001`)).rows[0].n);
check('수집한 공개 게시판 글은 비회원도 봄', anonSees === 1);
const legacyBoards = (await db.query(`update boards set legacy_mid='everybody' where slug='works' returning id`)).rows.length;
check('게시판에 기존 주소 이름 연결', legacyBoards === 1);

console.log(`통과 ${ok.length} / 실패 ${bad.length}`);
ok.forEach((x) => console.log('  ✓', x));
bad.forEach((x) => console.log('  ✗', x));
process.exit(bad.length ? 1 : 0);
