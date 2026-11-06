// team-aria.net 의 공개 게시판(글·댓글)을 파일로 수집한다. 운영자 허락을 받은 이전 작업용.
//
// 지키는 것
//   - robots.txt 의 Crawl-delay(3초): 모든 요청 사이를 최소 3초 띄운다 (더 짧게 못 줄인다)
//   - 로그인하지 않는다: 비회원이 볼 수 있는 글만 가져온다. 회원 전용 게시판은 건너뛴다
//   - 차단(403)·과부하(429/5xx)를 만나면 우회하지 않고 물러나거나 멈춘다
//   - 수집만 한다: 파일(import/crawl/)에만 쓰고 Supabase 는 건드리지 않는다. 넣는 건 load-crawl.mjs
//
// 실행 (아무 때나 Ctrl+C 로 멈추고, 다시 실행하면 이어서 한다)
//   node scripts/crawl-aria.mjs --boards=free --max-pages=1 --limit-docs=3   ← 먼저 소량 시험
//   node scripts/crawl-aria.mjs --index-only                                ← 목록만 모아 글 수·예상 시간 확인
//   node scripts/crawl-aria.mjs                                             ← 전체 (몇 시간 걸림)
//   옵션: --boards=a,b  --max-pages=N  --limit-docs=N  --index-only  --out=<폴더>
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASE, BOARD_MAP, parseCommentsOnly, parseDoc, parseList } from './lib/aria-parse.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const OUT = path.resolve(args.out || 'import/crawl');
const BOARDS = (args.boards ? String(args.boards).split(',') : Object.keys(BOARD_MAP)).filter((m) => {
  if (!BOARD_MAP[m]) console.warn(`알 수 없는 게시판 '${m}' 은 건너뜁니다. (가능: ${Object.keys(BOARD_MAP).join(', ')})`);
  return BOARD_MAP[m];
});
const MAX_PAGES = Number(args['max-pages']) || Infinity;
const LIMIT_DOCS = Number(args['limit-docs']) || Infinity;
const DELAY = 3000; // robots.txt Crawl-delay. 낮추는 옵션은 일부러 두지 않았다
const UA = 'TeamAriaMigration/0.1 (site migration with operator permission)';

mkdirSync(OUT, { recursive: true });
const F = { index: path.join(OUT, 'index.ndjson'), docs: path.join(OUT, 'docs.ndjson'), skipped: path.join(OUT, 'skipped.ndjson'), state: path.join(OUT, 'state.json') };
const readLines = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const append = (f, obj) => appendFileSync(f, JSON.stringify(obj) + '\n');
const state = existsSync(F.state) ? JSON.parse(readFileSync(F.state, 'utf8')) : { boards: {} };
const saveState = () => writeFileSync(F.state, JSON.stringify(state, null, 1));

const indexed = new Map(readLines(F.index).map((r) => [r.srl, r]));
const done = new Set(readLines(F.docs).map((d) => d.srl));
const skipped = new Set(readLines(F.skipped).map((d) => d.srl));

// ── 공손한 요청: 요청 사이 최소 3초, 일시 오류는 물러났다 다시 ──
let last = 0, failStreak = 0, requests = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = last + DELAY - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now(); requests++;
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(40_000), redirect: 'follow' });
      if (res.status === 403) { console.error('\n서버가 접근을 막았습니다(403). 우회하지 않고 멈춥니다. 운영자에게 확인해주세요.'); process.exit(2); }
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return { status: res.status, html: '' };
      failStreak = 0;
      return { status: res.status, html: await res.text() };
    } catch (e) {
      const backoff = [10, 30, 90][attempt] ?? 0;
      console.warn(`  ! ${url} → ${e.message}${backoff ? ` (${backoff}초 뒤 다시)` : ''}`);
      if (!backoff) break;
      await sleep(backoff * 1000);
    }
  }
  if (++failStreak >= 3) { console.error('\n연속으로 실패해 멈춥니다. 사이트 상태를 확인하고 다시 실행하면 이어서 합니다.'); process.exit(3); }
  return { status: 0, html: '' };
}

const listUrl = (mid, page) => `${BASE}/${mid}?page=${page}`;
const docUrl = (mid, srl, cpage) => `${BASE}/index.php?mid=${mid}&document_srl=${srl}${cpage ? `&cpage=${cpage}` : ''}`;

// ───────── 1단계: 목록 ─────────
console.log(`출력 폴더 ${OUT}\n게시판 ${BOARDS.length}개: ${BOARDS.join(', ')}\n`);
for (const mid of BOARDS) {
  const st = (state.boards[mid] ??= { nextPage: 1, lastPage: null, finished: false, membersOnly: false });
  if (st.finished || st.membersOnly) { console.log(`[${mid}] ${st.membersOnly ? '회원 전용이라 건너뜀' : '목록 완료'} (글 ${[...indexed.values()].filter((r) => r.mid === mid).length}개)`); continue; }
  console.log(`[${mid}] ${BOARD_MAP[mid].title} — 목록 수집 (${st.nextPage}쪽부터)`);
  for (let page = st.nextPage; page <= Math.min(st.lastPage ?? Infinity, MAX_PAGES); page++) {
    const { html, status } = await get(listUrl(mid, page));
    const { rows, lastPage, denied } = parseList(html);
    if (page === 1 || !st.lastPage) st.lastPage = lastPage;
    if (rows.length === 0) {
      if (page === 1 && denied) { st.membersOnly = true; console.log('  "권한이 없습니다" 안내가 나와 회원 전용으로 건너뜁니다'); }
      else if (page === 1) { console.warn(`  ! 글도 권한 안내도 없습니다 (HTTP ${status}). 화면 구조를 못 읽었을 수 있어 이 게시판은 다음 실행에서 다시 시도합니다`); break; }
      st.finished = true; saveState(); break;
    }
    let fresh = 0;
    for (const r of rows) if (!indexed.has(r.srl)) { indexed.set(r.srl, { ...r, mid }); append(F.index, { ...r, mid }); fresh++; }
    st.nextPage = page + 1;
    if (page >= st.lastPage) st.finished = true;
    saveState();
    if (page % 10 === 0 || page === 1 || st.finished) console.log(`  ${page}/${st.lastPage}쪽 (이번 ${fresh}개 새로, 누계 ${indexed.size})`);
    if (st.finished) break;
  }
}

const pending = [...indexed.values()].filter((r) => !done.has(r.srl) && !skipped.has(r.srl));
console.log(`\n목록 ${indexed.size}개, 이미 받은 글 ${done.size}개, 남은 글 ${pending.length}개`);
console.log(`남은 글을 받는 데 약 ${(pending.length * DELAY / 3_600_000).toFixed(1)}시간 (요청당 ${DELAY / 1000}초)`);
if (args['index-only']) process.exit(0);

// ───────── 2단계: 글 + 댓글 ─────────
const startedAt = Date.now();
let n = 0;
for (const r of pending) {
  if (n >= LIMIT_DOCS) { console.log(`\n--limit-docs=${LIMIT_DOCS} 에 도달해 멈춥니다. 같은 명령으로 이어서 받을 수 있어요.`); break; }
  const { html } = await get(docUrl(r.mid, r.srl));
  const doc = parseDoc(html, { srl: r.srl });
  if (!doc.ok) { append(F.skipped, { srl: r.srl, mid: r.mid, reason: doc.loginRequired ? 'login' : 'not-found' }); skipped.add(r.srl); n++; continue; }

  // 댓글이 여러 쪽이면 나머지 쪽도
  const byId = new Map(doc.comments.map((c) => [c.srl, c]));
  for (let cp = 1; cp <= doc.commentPages; cp++) {
    if (cp === 1 && doc.comments.length) continue; // 첫 요청에 이미 있는 쪽
    const page = await get(docUrl(r.mid, r.srl, cp));
    for (const c of parseCommentsOnly(page.html, r.srl)) byId.set(c.srl, c);
  }
  doc.comments = [...byId.values()];

  append(F.docs, { ...doc, mid: r.mid, isNotice: r.isNotice, commentCount: r.commentCount, thumbnail: r.thumbnail ?? null });
  done.add(r.srl); n++;
  if (n % 25 === 0) {
    const per = (Date.now() - startedAt) / n, left = (pending.length - n) * per;
    console.log(`  글 ${done.size}개 완료 (남은 ${pending.length - n}개, 약 ${(left / 3_600_000).toFixed(1)}시간)`);
  }
}
console.log(`\n끝. 이번에 글 ${n}개, 요청 ${requests}번. 결과: ${OUT}`);
