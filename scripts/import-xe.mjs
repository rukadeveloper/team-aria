// 기존 XE(XpressEngine/Rhymix) 데이터를 Supabase 로 옮긴다.
//
// 준비
//   1) 기존 사이트의 DB 덤프(.sql)를 이 PC 의 MySQL/MariaDB 에 불러온다 (원본 서버는 건드리지 않는다)
//   2) .env.local 에 XE_DB_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 를 채운다 (.env.example 참고)
//
// 실행
//   node scripts/import-xe.mjs                 ← 시험 실행: 무엇을 옮길지 개수·샘플만 보여주고 아무것도 쓰지 않음
//   node scripts/import-xe.mjs --run           ← 실제로 옮김 (여러 번 실행해도 중복되지 않음)
//   node scripts/import-xe.mjs --run --only=boards,posts
//
// ⚠ 이 도구는 XE 표준 테이블(xe_member, xe_documents, xe_comments, xe_files, xe_modules, xe_point)을 기준으로 작성했고,
//   실제 덤프로 아직 시험하지 못했다. 첫 시험 실행의 결과(개수·열 이름 오류)를 보고 맞춘다.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { createConnection } from 'mysql2/promise';
import path from 'node:path';

// .env.local 간단 로더
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
const RUN = args.includes('--run');
const ONLY = (args.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '').split(',').filter(Boolean);
const wants = (step) => ONLY.length === 0 || ONLY.includes(step);
const env = (k, d) => process.env[k] ?? d;
const P = env('XE_TABLE_PREFIX', 'xe_');
const BATCH = 500;

const need = (k) => {
  if (!env(k)) { console.error(`환경변수 ${k} 가 없습니다. (.env.local)`); process.exit(1); }
  return env(k);
};

const mysql = await createConnection({
  host: env('XE_DB_HOST', '127.0.0.1'), port: Number(env('XE_DB_PORT', '3306')),
  user: need('XE_DB_USER'), password: env('XE_DB_PASSWORD', ''), database: need('XE_DB_NAME'),
  dateStrings: true, // XE 의 regdate 는 'YYYYMMDDHHmmss' 문자열
});
const supa = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const q = async (sql, params = []) => (await mysql.query(sql, params))[0];
// XE 날짜 'YYYYMMDDHHmmss'(서버 시간대 = 한국) → ISO
const when = (s) => {
  const m = String(s ?? '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`).toISOString() : new Date().toISOString();
};
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const log = (...a) => console.log(...a);

async function upsert(table, rows, conflict) {
  if (!RUN) return;
  for (const part of chunks(rows, BATCH)) {
    const { error } = await supa.from(table).upsert(part, { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// ── 0. 어떤 테이블이 있는지 ──
const tables = new Set((await q('SHOW TABLES')).map((r) => Object.values(r)[0]));
const has = (t) => tables.has(P + t);
log(`연결됨. XE 테이블 접두어 '${P}', 발견: ${['member', 'documents', 'comments', 'files', 'modules', 'point'].map((t) => `${t}:${has(t) ? 'O' : 'X'}`).join(' ')}`);
log(RUN ? '▶ 실제 실행 모드\n' : '▷ 시험 실행 (아무것도 쓰지 않음). 실제로 옮기려면 --run\n');

// ── 1. 게시판 ──
const boardBySrl = new Map();
if (wants('boards')) {
  const mods = await q(`SELECT module_srl, mid, browser_title FROM ${P}modules WHERE module = 'board'`);
  const rows = mods.map((m) => ({ slug: String(m.mid).slice(0, 40), title: m.browser_title || m.mid, grp: 'community', sort: 100, legacy_module_srl: m.module_srl }));
  log(`게시판 ${rows.length}개:`, rows.slice(0, 8).map((r) => `${r.title}(${r.slug})`).join(', '));
  // 기본 게시판(0001_init.sql)은 slug 로 합치고, 나머지만 새로 만든다
  const { data: existing } = await supa.from('boards').select('id, slug, legacy_module_srl');
  const bySlug = new Map((existing ?? []).map((b) => [b.slug, b]));
  for (const r of rows) {
    const hit = bySlug.get(r.slug);
    if (RUN) {
      if (hit) await supa.from('boards').update({ legacy_module_srl: r.legacy_module_srl }).eq('id', hit.id);
      else await supa.from('boards').insert({ ...r, read_grade: null, write_grade: 'member' });
    }
  }
}
if (RUN) {
  const { data } = await supa.from('boards').select('id, legacy_module_srl').not('legacy_module_srl', 'is', null);
  for (const b of data ?? []) boardBySrl.set(Number(b.legacy_module_srl), b.id);
}

// ── 2. 회원 ──
// 비밀번호는 옮기지 않는다 (XE 의 해시 방식은 Supabase 와 달라서). 회원은 '비밀번호 찾기'로 다시 설정한다.
const profileBySrl = new Map();
if (wants('members') && has('member')) {
  const members = await q(`SELECT member_srl, user_id, email_address, nick_name, user_name, regdate FROM ${P}member`);
  const withEmail = members.filter((m) => m.email_address);
  log(`회원 ${members.length}명 (이메일 있음 ${withEmail.length}, 없음 ${members.length - withEmail.length} → 옮기지 못함)`);
  if (RUN) {
    let n = 0;
    for (const m of withEmail) {
      const { data: found } = await supa.from('profiles').select('id').eq('legacy_member_srl', m.member_srl).maybeSingle();
      if (found) { profileBySrl.set(Number(m.member_srl), found.id); continue; }
      const { data, error } = await supa.auth.admin.createUser({
        email: m.email_address, email_confirm: true,
        user_metadata: { nickname: m.nick_name || m.user_name || m.user_id },
      });
      if (error) { log(`  ! ${m.email_address}: ${error.message}`); continue; }
      await supa.from('profiles').update({ legacy_member_srl: m.member_srl, legacy_user_id: m.user_id, joined_at: when(m.regdate) }).eq('id', data.user.id);
      profileBySrl.set(Number(m.member_srl), data.user.id);
      if (++n % 100 === 0) log(`  회원 ${n}명 처리`);
    }
  }
}
if (RUN && profileBySrl.size === 0) {
  const { data } = await supa.from('profiles').select('id, legacy_member_srl').not('legacy_member_srl', 'is', null);
  for (const p of data ?? []) profileBySrl.set(Number(p.legacy_member_srl), p.id);
}

// ── 3. 포인트 ──
if (wants('points') && has('point') && RUN) {
  for (const p of await q(`SELECT member_srl, point FROM ${P}point`)) {
    const id = profileBySrl.get(Number(p.member_srl));
    if (id) await supa.from('profiles').update({ points: Math.max(0, Number(p.point) || 0) }).eq('id', id);
  }
} else if (wants('points') && has('point')) log(`포인트 ${(await q(`SELECT COUNT(*) c FROM ${P}point`))[0].c}명분`);

// ── 4. 글 ──
if (wants('posts') && has('documents')) {
  const total = (await q(`SELECT COUNT(*) c FROM ${P}documents`))[0].c;
  log(`글 ${total}개`);
  let offset = 0, done = 0, skipped = 0;
  for (;;) {
    const docs = await q(`SELECT document_srl, module_srl, title, content, member_srl, nick_name, readed_count, is_notice, regdate, last_update FROM ${P}documents ORDER BY document_srl LIMIT ? OFFSET ?`, [BATCH, offset]);
    if (!docs.length) break;
    const rows = [];
    for (const d of docs) {
      const board_id = boardBySrl.get(Number(d.module_srl));
      if (RUN && !board_id) { skipped++; continue; }
      rows.push({
        legacy_document_srl: d.document_srl, board_id: board_id ?? 0,
        author_id: profileBySrl.get(Number(d.member_srl)) ?? null, author_name: d.nick_name || '알 수 없음',
        title: String(d.title ?? '').slice(0, 200) || '(제목 없음)', content: d.content ?? '',
        is_notice: d.is_notice === 'Y', view_count: Number(d.readed_count) || 0,
        created_at: when(d.regdate), updated_at: when(d.last_update || d.regdate),
      });
    }
    await upsert('posts', rows, 'legacy_document_srl');
    done += rows.length; offset += BATCH;
    if (RUN) log(`  글 ${done}/${total}`);
    if (!RUN) break; // 시험 실행은 개수만
  }
  if (skipped) log(`  게시판을 못 찾아 건너뜀: ${skipped}개 (보관함·휴지통 등)`);
}

// ── 5. 댓글 ──
if (wants('comments') && has('comments')) {
  log(`댓글 ${(await q(`SELECT COUNT(*) c FROM ${P}comments`))[0].c}개`);
  if (RUN) {
    const { data: posts } = await supa.from('posts').select('id, legacy_document_srl').not('legacy_document_srl', 'is', null);
    const postBySrl = new Map((posts ?? []).map((p) => [Number(p.legacy_document_srl), p.id]));
    let offset = 0;
    for (;;) {
      const cs = await q(`SELECT comment_srl, document_srl, content, member_srl, nick_name, regdate FROM ${P}comments ORDER BY comment_srl LIMIT ? OFFSET ?`, [BATCH, offset]);
      if (!cs.length) break;
      const rows = cs.filter((c) => postBySrl.has(Number(c.document_srl))).map((c) => ({
        legacy_comment_srl: c.comment_srl, post_id: postBySrl.get(Number(c.document_srl)),
        author_id: profileBySrl.get(Number(c.member_srl)) ?? null, author_name: c.nick_name || '알 수 없음',
        content: String(c.content ?? '').slice(0, 5000) || '(내용 없음)', created_at: when(c.regdate),
      }));
      await upsert('comments', rows, 'legacy_comment_srl');
      offset += BATCH;
    }
  }
}

// ── 6. 첨부파일 ── (파일 복사는 --files=<XE 의 files 폴더> 를 줄 때만)
if (wants('files') && has('files')) {
  const filesDir = (args.find((a) => a.startsWith('--files=')) ?? '').replace('--files=', '');
  const total = (await q(`SELECT COUNT(*) c FROM ${P}files WHERE upload_target_type = 'doc'`))[0].c;
  log(`첨부파일 ${total}개 (글에 붙은 것)${filesDir ? '' : ' — 실제 파일을 올리려면 --files=<XE 의 files 폴더 경로> 필요'}`);
  if (RUN && filesDir) {
    const { data: posts } = await supa.from('posts').select('id, legacy_document_srl').not('legacy_document_srl', 'is', null);
    const postBySrl = new Map((posts ?? []).map((p) => [Number(p.legacy_document_srl), p.id]));
    let ok = 0, missing = 0;
    for (const f of await q(`SELECT file_srl, upload_target_srl, source_filename, uploaded_filename, file_size, download_count FROM ${P}files WHERE upload_target_type = 'doc'`)) {
      const post_id = postBySrl.get(Number(f.upload_target_srl));
      // uploaded_filename 은 './files/attach/binaries/...' 형태
      const local = path.join(filesDir, '..', String(f.uploaded_filename).replace(/^\.\//, ''));
      if (!post_id || !existsSync(local)) { missing++; continue; }
      const storage_path = `legacy/${f.file_srl}/${f.source_filename}`.replace(/[^\w./-]/g, '_');
      const { error } = await supa.storage.from('attachments').upload(storage_path, readFileSync(local), { upsert: true });
      if (error) { log(`  ! ${f.source_filename}: ${error.message}`); continue; }
      await supa.from('attachments').upsert({ legacy_file_srl: f.file_srl, post_id, storage_path, file_name: f.source_filename, size_bytes: Number(f.file_size) || 0, download_count: Number(f.download_count) || 0 }, { onConflict: 'legacy_file_srl' });
      ok++;
    }
    log(`  파일 ${ok}개 올림, 원본 없음/글 없음 ${missing}개`);
  }
}

await mysql.end();
log('\n끝.');
