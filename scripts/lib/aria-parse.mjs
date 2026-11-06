// team-aria.net(XpressEngine) 의 목록·글 페이지 HTML 을 읽어 구조화한다. 네트워크 없이 시험할 수 있게 파싱만 모았다.
import * as cheerio from 'cheerio';

export const BASE = 'https://team-aria.net';

// 기존 게시판 주소(mid) → 새 사이트 게시판(slug). 새 사이트의 기본 게시판은 supabase/migrations/0001_init.sql 과 같다
export const BOARD_MAP = {
  notice: { slug: 'notice', title: '공지사항' },
  request: { slug: 'request', title: '작품신청' },
  FAQ: { slug: 'qna', title: '질문/건의' },
  databoard: { slug: 'archive', title: '자료실' },
  free: { slug: 'free', title: '자유게시판' },
  fun: { slug: 'humor', title: '유머게시판' },
  story: { slug: 'radio', title: '라디오' },
  attendance: { slug: 'attendance', title: '출석부' },
  UP: { slug: 'rankup', title: '승급 신청' },
  ariaevent: { slug: 'event', title: '이벤트' },
  everybody: { slug: 'works', title: '작품 게시판' },
  everyedit: { slug: 'collab', title: '합작 게시판' },
  portfolio: { slug: 'official', title: '팀 더빙 작품' },
  radio: { slug: 'team-radio', title: '팀 라디오' },
  unit: { slug: 'unit', title: '팀 유닛 작품' },
  ariatoon: { slug: 'toon', title: '아리아툰' },
};

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = (s) => Number(String(s ?? '').replace(/[^\d]/g, '')) || 0;

// '2024.11.28. 11:00' (한국 시간) → ISO. 시각이 없으면 낮 12시로 둔다
export function parseDate(text) {
  const m = String(text ?? '').match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const p = (n) => String(n).padStart(2, '0');
  return new Date(`${m[1]}-${p(m[2])}-${p(m[3])}T${p(m[4] ?? 12)}:${m[5] ?? '00'}:00+09:00`).toISOString();
}

// 글쓴이 이름: 등급 아이콘 이미지는 빼고 글자만
function authorOf($, scope) {
  const a = scope.find('a[class*="member_"]').first();
  const copy = (a.length ? a : scope).clone();
  copy.find('img').remove();
  const srl = (a.attr('class') ?? '').match(/member_(\d+)/)?.[1];
  return { name: clean(copy.text()), srl: srl ? Number(srl) : null };
}

// '/free/123', 'index.php?mid=free&document_srl=123', '/123' 모두 처리
export function srlFromHref(href) {
  const h = String(href ?? '');
  return h.match(/document_srl=(\d+)/)?.[1] ?? h.match(/team-aria\.net\/(?:[A-Za-z_]+\/)?(\d{2,})(?:[?#]|$)/)?.[1] ?? h.match(/^\/(?:[A-Za-z_]+\/)?(\d{2,})(?:[?#]|$)/)?.[1] ?? null;
}

// 본문 안의 상대 주소를 절대 주소로 (옮긴 뒤에도 원본 이미지가 보이게)
function absolutize($, root) {
  root.find('[src],[href]').each((_, el) => {
    for (const attr of ['src', 'href']) {
      const v = $(el).attr(attr);
      if (!v || /^(https?:|mailto:|#|data:)/i.test(v)) continue;
      try { $(el).attr(attr, new URL(v, BASE + '/').toString()); } catch { /* 잘못된 주소는 그대로 */ }
    }
  });
}

// '568.8KB', '7.65MB' → 바이트
export function sizeToBytes(text) {
  const m = String(text ?? '').match(/([\d.]+)\s*([KMG]?)B/i);
  if (!m) return null;
  return Math.round(Number(m[1]) * { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m[2].toUpperCase()]);
}

// ───────── 목록 페이지 ─────────
export function parseList(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $('table[summary="List of Articles"] tbody tr').each((_, tr) => {
    const row = $(tr);
    const link = row.find('td.title a[href*="document_srl"], td.title a[href]').first();
    const srl = srlFromHref(link.attr('href'));
    if (!srl) return;
    const titleCopy = link.clone(); titleCopy.find('img').remove();
    const author = authorOf($, row.find('td.author'));
    rows.push({
      srl: Number(srl),
      title: clean(titleCopy.text()),
      category: clean(row.find('td.category').text()) || null,
      author: author.name, authorSrl: author.srl,
      listDate: clean(row.find('td.time').text()),
      readCount: num(row.find('td.read_num').text()),
      commentCount: num(row.find('a.cm_num').first().text()),
      isNotice: row.hasClass('normal_notice') || /공지/.test(clean(row.find('td.no').text())),
    });
  });

  // 웹진/갤러리 스킨: 글마다 <li> 에 제목(h3)·썸네일·댓글/조회/추천 수가 있다 (팀 더빙 작품 등)
  if (rows.length === 0) {
    $('ol.bd_lst > li, ul.bd_lst > li').each((_, li) => {
      const item = $(li);
      const srl = srlFromHref(item.find('a.hx, a[href*="document_srl"]').first().attr('href'));
      const title = clean(item.find('h3').first().text());
      if (!srl || !title) return;
      const stat = (icon) => num(item.find(`i.fa-${icon}`).first().parent().find('b').first().text());
      rows.push({
        srl: Number(srl), title, category: null, author: '', authorSrl: null, listDate: '',
        readCount: stat('eye'), commentCount: stat('comment'), isNotice: false,
        thumbnail: item.find('img.tmb').first().attr('src') ?? null,
      });
    });
  }

  // 그 밖의 스킨이면 글 링크만 모은다
  if (rows.length === 0) {
    const seen = new Set();
    $('#c_board a[href*="document_srl="]').each((_, a) => {
      const srl = srlFromHref($(a).attr('href'));
      if (!srl || seen.has(srl)) return;
      const title = clean($(a).text());
      if (!title || /^\[\d+\]$/.test(title)) return;
      seen.add(srl);
      rows.push({ srl: Number(srl), title, category: null, author: '', authorSrl: null, listDate: '', readCount: 0, commentCount: 0, isNotice: false });
    });
  }

  // 페이지 번호 링크에서 마지막 페이지
  let lastPage = 1;
  $('a[href*="page="]').each((_, a) => {
    const m = ($(a).attr('href') ?? '').match(/[?&]page=(\d+)/);
    if (m && !/document_srl=|category=|act=/.test($(a).attr('href'))) lastPage = Math.max(lastPage, Number(m[1]));
  });
  // 글이 하나도 없는데 '권한이 없습니다' 안내가 있으면 회원 전용 게시판 (파서가 못 읽은 것과 구분)
  const denied = rows.length === 0 && /권한이 없|로그인해 주|로그인해주/.test(clean($('body').text()));
  return { rows, lastPage, denied };
}

// ───────── 글 페이지 ─────────
export function parseDoc(html, { srl }) {
  const $ = cheerio.load(html);
  const text = clean($('body').text());
  const result = { srl, ok: false, loginRequired: false, notFound: false };

  const body = $(`div.xe_content[class*="document_${srl}_"]`).first();
  if (!body.length) {
    result.loginRequired = /로그인|권한이 없|접근 권한|dispMemberLoginForm/.test(text) && !/조회 수/.test(text);
    result.notFound = !result.loginRequired;
    return result;
  }
  body.find('.yt-ext-hidden').remove(); // 크롬 확장이 끼워 넣은 문구
  absolutize($, body);

  const head = $('article .article_header').first();
  const titleCopy = head.find('h1').first().clone(); titleCopy.find('img').remove();
  const author = authorOf($, head.find('.author').first());

  const comments = [];
  // 대댓글은 DOM 중첩이 아니라 'cm_art ind ind1' 같은 들여쓰기 클래스로 표시되고, 부모 바로 뒤에 이어진다
  const lastAtDepth = [];
  $('article.cm_art').each((_, el) => {
    const c = $(el);
    const cid = (c.attr('id') ?? '').match(/comment_(\d+)/)?.[1];
    const content = c.find('div.xe_content[class*="comment_"]').first();
    if (!cid || !content.length) return;
    content.find('.yt-ext-hidden').remove();
    absolutize($, content);
    const a = authorOf($, c.find('.cm_hd .author').first());
    const depth = Number((c.attr('class') ?? '').match(/\bind(\d+)\b/)?.[1] ?? 0);
    const parentSrl = depth > 0 ? (lastAtDepth[depth - 1] ?? null) : null;
    lastAtDepth[depth] = Number(cid);
    lastAtDepth.length = depth + 1;
    comments.push({
      srl: Number(cid), parentSrl, depth,
      author: a.name, authorSrl: a.srl,
      date: parseDate(c.find('.cm_hd .date').first().text()),
      html: content.html()?.trim() ?? '',
    });
  });

  // 댓글이 여러 페이지면 cpage 번호가 링크로 나온다
  let commentPages = 1;
  $('#comment a[href*="cpage="]').each((_, a) => {
    const m = ($(a).attr('href') ?? '').match(/cpage=(\d+)/);
    if (m) commentPages = Math.max(commentPages, Number(m[1]));
  });

  // 첨부파일: 글 아래 '파일 목록' (이름 · 용량 · 받은 횟수). 회원 등급 아이콘 등은 여기에 없다
  const attachments = [];
  $('.file_list2 li').each((_, li) => {
    const a = $(li).find('a[href*="procFileDownload"]').first();
    const href = a.attr('href');
    if (!href) return;
    const meta = clean($(li).find('.num').text()); // (File Size:568.8KB/Download:0)
    attachments.push({
      fileSrl: Number(href.match(/file_srl=(\d+)/)?.[1]) || null,
      url: new URL(href.replace(/&amp;/g, '&'), BASE + '/').toString(),
      name: clean(a.text()) || null,
      sizeBytes: sizeToBytes(meta.match(/Size:\s*([\d.]+\s*[KMG]?B)/i)?.[1]),
      downloads: Number(meta.match(/Download:\s*(\d+)/i)?.[1]) || 0,
    });
  });
  const tags = $('.tag_list a.tag').map((_, a) => clean($(a).text()).replace(/^#/, '')).get().filter(Boolean);

  // 확장 입력란: 작품 글의 제작진 표 (노래·녹음·믹싱·가사·번역·공개일 …). 링크 칸(음원 받기)은 회원 전용이라 주소만 보관
  const extra = [];
  $('table.et_vars tr').each((_, tr) => {
    const label = clean($(tr).find('th').text());
    const cell = $(tr).find('td').first();
    if (!label) return;
    const link = cell.find('a[href]').first().attr('href');
    extra.push(link
      ? { label, value: clean(cell.text()), link: new URL(link.replace(/&amp;/g, '&'), BASE + '/').toString(), memberOnly: /회원만|onclick/.test(cell.html() ?? '') }
      : { label, value: clean(cell.text()) });
  });

  return {
    ...result, ok: true,
    title: clean(titleCopy.text()),
    author: author.name, authorSrl: author.srl,
    category: clean(head.find('a.category').first().text()) || null,
    date: parseDate(head.find('.date').first().text()),
    readCount: num(head.find('.read .num').first().text()),
    html: body.html()?.trim() ?? '',
    images: [...new Set(body.find('img[src]').map((_, i) => $(i).attr('src')).get())],
    attachments: [...new Map(attachments.map((a) => [a.fileSrl ?? a.url, a])).values()],
    tags, extra,
    comments, commentPages,
  };
}

// 댓글 전용 추가 페이지(cpage=N)에서 댓글만 뽑는다
export function parseCommentsOnly(html, srl) {
  const parsed = parseDoc(html, { srl });
  return parsed.ok ? parsed.comments : [];
}
