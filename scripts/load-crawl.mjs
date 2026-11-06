// crawl-aria.mjs 가 모은 파일(import/crawl/*.ndjson)을 Supabase 에 넣는다.
//
//   node scripts/load-crawl.mjs                 ← 시험: 무엇을 넣을지 개수와 문제점만 보여주고 아무것도 쓰지 않음
//   node scripts/load-crawl.mjs --run           ← 실제로 넣음 (여러 번 실행해도 중복되지 않음)
//   옵션: --dir=<수집 폴더>  --only=boards,posts,comments,attachments
//
// 필요: supabase/migrations 0001, 0002 를 먼저 실행해 둘 것. .env.local 에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 회원은 옮기지 않는다: 글·댓글에는 글쓴이 이름과 기존 글쓴이 번호만 남고, 작성자 계정은 비어 있다.
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { BOARD_MAP } from './lib/aria-parse.mjs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const RUN = Boolean(args.run);
const DIR = path.resolve(args.dir || 'import/crawl');
const ONLY = String(args.only || '').split(',').filter(Boolean);
const wants = (s) => ONLY.length === 0 || ONLY.includes(s);
const BATCH = 100; // 글 본문이 커서 작게

let supa = null;
if (RUN) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) if (!process.env[k]) { console.error(`환경변수 ${k} 가 없습니다. (.env.local)`); process.exit(1); }
  supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function* lines(file) {
  if (!existsSync(file)) return;
  for await (const l of createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })) if (l.trim()) yield JSON.parse(l);
}
const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const log = console.log;
const warn = { longTitle: 0, longComment: 0, noBoard: 0, noDate: 0 };

async function upsert(table, rows, conflict) {
  if (!RUN || rows.length === 0) return;
  for (const part of chunks(rows, BATCH)) {
    const { error } = await supa.from(table).upsert(part, { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
// 번호(legacy_*) → id 대응표
async function idMap(table, legacyCol) {
  const map = new Map();
  if (!RUN) return map;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from(table).select(`id, ${legacyCol}`).not(legacyCol, 'is', null).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of data) map.set(Number(r[legacyCol]), r.id);
    if (data.length < 1000) break;
  }
  return map;
}

log(`${RUN ? '▶ 실제 실행' : '▷ 시험 실행 (아무것도 쓰지 않음, 실제로 넣으려면 --run)'}  폴더: ${DIR}\n`);

// ───── 1. 게시판 ─────
const boardIdByMid = new Map();
if (wants('boards')) {
  log(`게시판 ${Object.keys(BOARD_MAP).length}개를 기존 주소 이름(mid)과 연결`);
  if (RUN) {
    for (const [mid, b] of Object.entries(BOARD_MAP)) {
      const { error } = await supa.from('boards').update({ legacy_mid: mid }).eq('slug', b.slug);
      if (error) throw new Error(`boards: ${error.message}`);
    }
  }
}
if (RUN) {
  const { data, error } = await supa.from('boards').select('id, legacy_mid').not('legacy_mid', 'is', null);
  if (error) throw new Error(`boards: ${error.message}`);
  for (const b of data) boardIdByMid.set(b.legacy_mid, b.id);
  const missing = Object.keys(BOARD_MAP).filter((m) => !boardIdByMid.has(m));
  if (missing.length) { console.error(`게시판을 찾지 못함: ${missing.join(', ')} — 0001_init.sql 을 먼저 실행했는지 확인하세요.`); process.exit(1); }
}

// ───── 2. 글 ─────
let postCount = 0, commentCount = 0, attachCount = 0;
if (wants('posts')) {
  let batch = [];
  for await (const d of lines(path.join(DIR, 'docs.ndjson'))) {
    if (!BOARD_MAP[d.mid]) { warn.noBoard++; continue; }
    if (d.title.length > 200) warn.longTitle++;
    if (!d.date) warn.noDate++;
    batch.push({
      legacy_document_srl: d.srl,
      board_id: RUN ? boardIdByMid.get(d.mid) : 0,
      author_id: null,
      author_name: d.author || '알 수 없음',
      legacy_author_srl: d.authorSrl,
      title: (d.title || '(제목 없음)').slice(0, 200),
      content: d.html || '',
      is_notice: Boolean(d.isNotice),
      view_count: d.readCount || 0,
      comment_count: 0, // 댓글을 넣으면 DB 가 센다
      tags: d.tags ?? [],
      legacy_category: d.category,
      meta: { ...(d.extra?.length ? { credits: d.extra } : {}), ...(d.thumbnail ? { thumbnail: d.thumbnail } : {}) },
      created_at: d.date ?? new Date().toISOString(),
      updated_at: d.date ?? new Date().toISOString(),
    });
    postCount++;
    if (batch.length >= BATCH) { await upsert('posts', batch, 'legacy_document_srl'); batch = []; if (RUN && postCount % 1000 === 0) log(`  글 ${postCount}개`); }
  }
  await upsert('posts', batch, 'legacy_document_srl');
  log(`글 ${postCount}개`);
}

// ───── 3. 댓글 (먼저 모두 넣고, 대댓글의 부모는 마지막에 연결) ─────
if (wants('comments')) {
  const postId = await idMap('posts', 'legacy_document_srl');
  const parents = []; // {srl, parentSrl}
  let batch = [];
  for await (const d of lines(path.join(DIR, 'docs.ndjson'))) {
    if (RUN && !postId.has(d.srl)) continue;
    for (const c of d.comments ?? []) {
      if (c.html.length > 5000) warn.longComment++;
      batch.push({
        legacy_comment_srl: c.srl, post_id: RUN ? postId.get(d.srl) : 0, parent_id: null,
        author_id: null, author_name: c.author || '알 수 없음', legacy_author_srl: c.authorSrl,
        content: (c.html || '(내용 없음)').slice(0, 5000), created_at: c.date ?? d.date ?? new Date().toISOString(),
      });
      if (c.parentSrl) parents.push({ srl: c.srl, parentSrl: c.parentSrl });
      commentCount++;
      if (batch.length >= BATCH) { await upsert('comments', batch, 'legacy_comment_srl'); batch = []; }
    }
  }
  await upsert('comments', batch, 'legacy_comment_srl');
  log(`댓글 ${commentCount}개 (그중 대댓글 ${parents.length}개)`);
  if (RUN && parents.length) {
    const cid = await idMap('comments', 'legacy_comment_srl');
    let linked = 0;
    for (const part of chunks(parents, 20)) {
      await Promise.all(part.map(async (p) => {
        const parent = cid.get(p.parentSrl);
        if (!parent) return;
        const { error } = await supa.from('comments').update({ parent_id: parent }).eq('legacy_comment_srl', p.srl);
        if (error) throw new Error(`comments: ${error.message}`);
        linked++;
      }));
    }
    log(`  대댓글 ${linked}개의 부모를 연결`);
  }
}

// ───── 4. 첨부파일 (파일 자체는 옮기지 않고 기존 주소만 기록) ─────
if (wants('attachments')) {
  const postId = await idMap('posts', 'legacy_document_srl');
  let batch = [];
  for await (const d of lines(path.join(DIR, 'docs.ndjson'))) {
    if (RUN && !postId.has(d.srl)) continue;
    for (const a of d.attachments ?? []) {
      if (!a.fileSrl) continue;
      batch.push({
        legacy_file_srl: a.fileSrl, post_id: RUN ? postId.get(d.srl) : 0, storage_path: null, source_url: a.url,
        file_name: a.name || `file-${a.fileSrl}`, size_bytes: a.sizeBytes ?? 0, download_count: a.downloads ?? 0,
      });
      attachCount++;
    }
  }
  await upsert('attachments', batch, 'legacy_file_srl');
  log(`첨부파일 ${attachCount}개 (기존 주소만 기록. 파일 자체를 새 저장소로 옮기는 건 별도 작업)`);
}

// ───── 요약 ─────
log('\n--- 점검');
if (warn.noBoard) log(`  · 게시판을 모르는 글 ${warn.noBoard}개 (건너뜀)`);
if (warn.longTitle) log(`  · 제목이 200자를 넘어 잘린 글 ${warn.longTitle}개`);
if (warn.longComment) log(`  · 5000자를 넘어 잘린 댓글 ${warn.longComment}개`);
if (warn.noDate) log(`  · 날짜를 못 읽은 글 ${warn.noDate}개 (지금 시각으로 넣음)`);
if (!warn.noBoard && !warn.longTitle && !warn.longComment && !warn.noDate) log('  · 문제 없음');
log(RUN ? '\n끝.' : '\n시험 실행이라 아무것도 쓰지 않았습니다.');
