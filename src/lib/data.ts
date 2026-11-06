import { createClient } from '@supabase/supabase-js';
import { cacheLife, cacheTag } from 'next/cache';
import sanitizeHtml from 'sanitize-html';

export interface PostSummary {
  id: number;
  board: string; // slug
  title: string;
  author: string;
  createdAt: string;
  comments: number;
  isNotice?: boolean;
  // 작품 피드·슬라이드용
  thumbnail?: string | null;
  summary?: string;
}

export interface CommentSummary {
  id: number;
  postId: number;
  board: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface HomeData {
  isSample: boolean;
  slides: PostSummary[];
  works: PostSummary[];
  boards: Record<string, PostSummary[]>;
  comments: CommentSummary[];
}

// 홈에 목록으로 보여주는 게시판 (기존 메인 페이지와 같은 순서)
export const HOME_BOARDS = [
  { slug: 'notice', title: '공지사항' },
  { slug: 'toon', title: '아리아툰' },
  { slug: 'free', title: '자유 게시판' },
  { slug: 'request', title: '작품신청 게시판' },
  { slug: 'works', title: '작품 게시판' },
  { slug: 'collab', title: '합작 게시판', memberOnly: '정회원 전용' },
] as const;

const LIST_SIZE = 7;
const FEED_SIZE = 12;
const SLIDE_SIZE = 5;
const COMMENT_SIZE = 12;

// ── 본문 HTML 에서 썸네일·요약 뽑기 ──
export function firstImage(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  const src = m?.[1];
  return src && /^https?:\/\//i.test(src) ? src : null;
}

export function excerpt(html: string, max = 90): string {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// 비로그인 읽기 전용 클라이언트. 권한(RLS)이 DB 에서 걸리므로 비회원이 못 보는 게시판 글은 애초에 오지 않는다
function publicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

// ── Supabase 연결 전 화면 확인용 예시 (실제 글이 아니다) ──
function sample(): HomeData {
  const NAMES = ['예시회원', '더빙러', '하늘별', '팀원', '관리팀원'];
  let seq = 0;
  const day = (n: number) => new Date(Date.UTC(2026, 10, 5 - n, 3, 0)).toISOString();
  const mk = (board: string, label: string, n: number, extra: Partial<PostSummary> = {}): PostSummary => {
    seq += 1;
    return {
      id: seq, board, title: `[예시] ${label} ${n}`, author: NAMES[seq % NAMES.length],
      createdAt: day(n), comments: seq % 4 === 0 ? 0 : (seq * 3) % 11, ...extra,
    };
  };
  const list = (board: string, label: string, n = LIST_SIZE, extra: Partial<PostSummary> = {}) =>
    Array.from({ length: n }, (_, i) => mk(board, label, i + 1, extra));
  return {
    isSample: true,
    slides: Array.from({ length: SLIDE_SIZE }, (_, i) => mk('notice', '아리아 소식', i + 1, { summary: '슬라이드에는 최신 소식·신작 작품의 대표 이미지가 들어갑니다.' })),
    works: Array.from({ length: FEED_SIZE }, (_, i) =>
      mk('works', '작품', i + 1, { summary: '작품 소개 글이 두 줄 정도 요약되어 보입니다. 원곡과 작품 설명, 참여한 사람들의 한마디가 여기에 나와요.' })),
    boards: {
      notice: list('notice', '공지사항').map((p, i) => ({ ...p, isNotice: i < 2 })),
      toon: list('toon', '아리아툰 제', 7).map((p, i) => ({ ...p, title: `[예시] 아리아툰 제${84 - i}화` })),
      free: list('free', '자유 글'),
      request: list('request', '작품신청'),
      works: list('works', '작품'),
      collab: [],
    },
    comments: Array.from({ length: COMMENT_SIZE }, (_, i) => ({
      id: i + 1, postId: i + 1, board: i % 2 ? 'free' : 'works', author: NAMES[i % NAMES.length],
      text: '[예시] 댓글 내용이 이렇게 한두 줄로 보입니다. 잘 들었어요, 응원합니다!', createdAt: day(i),
    })),
  };
}

const POST_COLUMNS = 'id, title, author_name, created_at, comment_count, is_notice';

interface PostRow {
  id: number; title: string; author_name: string; created_at: string; comment_count: number; is_notice: boolean;
  content?: string; boards?: { slug: string } | { slug: string }[] | null;
}
const slugOf = (b: PostRow['boards']) => (Array.isArray(b) ? b[0]?.slug : b?.slug) ?? '';
const toPost = (r: PostRow, board: string): PostSummary => ({
  id: r.id, board, title: r.title, author: r.author_name, createdAt: r.created_at, comments: r.comment_count, isNotice: r.is_notice,
});

export interface BoardPage {
  posts: PostSummary[];
  page: number;
  pageSize: number;
  total: number;
}

const BOARD_PAGE_SIZE = 20;

// 게시판 글 목록 (페이지 단위). 글이 없거나 연결 전이면 빈 목록
export async function getBoardPosts(slug: string, page = 1): Promise<BoardPage> {
  'use cache';
  cacheLife('minutes');
  cacheTag('posts');

  const pageSize = BOARD_PAGE_SIZE;
  if (!hasSupabase) return { posts: [], page, pageSize, total: 0 };
  try {
    const db = publicClient();
    const from = (page - 1) * pageSize;
    const { data, error, count } = await db
      .from('posts')
      .select(`${POST_COLUMNS}, boards!inner(slug)`, { count: 'exact' })
      .eq('boards.slug', slug)
      .order('is_notice', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    return {
      posts: ((data ?? []) as unknown as PostRow[]).map((r) => toPost(r, slug)),
      page, pageSize, total: count ?? 0,
    };
  } catch {
    return { posts: [], page, pageSize, total: 0 };
  }
}

export interface PostCredit {
  label: string;
  value: string;
  link?: string;
  memberOnly?: boolean;
}

export interface PostDetail {
  id: number;
  board: string; // slug
  title: string;
  author: string;
  createdAt: string;
  viewCount: number;
  commentCount: number;
  isNotice: boolean;
  tags: string[];
  content: string; // HTML. 화면에 그릴 때 cleanHtml() 을 거쳐야 한다
  credits?: PostCredit[];
}

export interface CommentNode {
  id: number;
  parentId: number | null;
  author: string;
  content: string; // HTML. cleanHtml() 을 거쳐야 한다
  createdAt: string;
}

// 글 하나 + 댓글. 없거나(삭제·권한 없음) 연결 전이면 null
export async function getPost(slug: string, id: number): Promise<{ post: PostDetail; comments: CommentNode[] } | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag('posts');

  if (!hasSupabase || !Number.isFinite(id)) return null;
  try {
    const db = publicClient();
    const { data, error } = await db
      .from('posts')
      .select('id, title, author_name, created_at, view_count, comment_count, is_notice, tags, content, meta, boards!inner(slug)')
      .eq('id', id)
      .eq('boards.slug', slug)
      .single();
    if (error || !data) return null;

    const { data: commentRows, error: commentError } = await db
      .from('comments')
      .select('id, parent_id, author_name, content, created_at')
      .eq('post_id', id)
      .order('created_at', { ascending: true });
    if (commentError) throw commentError;

    const meta = (data.meta ?? {}) as { credits?: PostCredit[] };
    return {
      post: {
        id: data.id, board: slug, title: data.title, author: data.author_name, createdAt: data.created_at,
        viewCount: data.view_count, commentCount: data.comment_count, isNotice: data.is_notice,
        tags: data.tags ?? [], content: data.content, credits: meta.credits,
      },
      comments: (commentRows ?? []).map((c) => ({
        id: c.id, parentId: c.parent_id, author: c.author_name, content: c.content, createdAt: c.created_at,
      })),
    };
  } catch {
    return null;
  }
}

// 홈 화면에 필요한 데이터를 한 번에. 5분 캐시, 글을 쓰면 'posts' 태그로 즉시 갱신할 수 있다
export async function getHome(): Promise<HomeData> {
  'use cache';
  cacheLife('minutes');
  cacheTag('posts');

  if (!hasSupabase) return sample();
  try {
    const db = publicClient();

    const boards: Record<string, PostSummary[]> = {};
    await Promise.all(
      HOME_BOARDS.map(async ({ slug }) => {
        const { data, error } = await db
          .from('posts')
          .select(`${POST_COLUMNS}, boards!inner(slug)`)
          .eq('boards.slug', slug)
          .order('is_notice', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(LIST_SIZE);
        if (error) throw error;
        boards[slug] = ((data ?? []) as unknown as PostRow[]).map((r) => toPost(r, slug));
      }),
    );

    // 작품 피드 + 슬라이드: 작품·공식작품 게시판의 최신글에서 대표 이미지와 요약을 뽑는다
    const feed = await db
      .from('posts')
      .select(`${POST_COLUMNS}, content, boards!inner(slug)`)
      .in('boards.slug', ['works', 'official', 'unit', 'team-radio'])
      .order('created_at', { ascending: false })
      .limit(40);
    if (feed.error) throw feed.error;
    const withMedia = ((feed.data ?? []) as unknown as PostRow[]).map((r) => ({
      ...toPost(r, slugOf(r.boards)),
      thumbnail: firstImage(r.content ?? ''),
      summary: excerpt(r.content ?? ''),
    }));
    // 슬라이드는 이미지가 있는 글 우선
    const slides = [...withMedia.filter((p) => p.thumbnail), ...withMedia.filter((p) => !p.thumbnail)].slice(0, SLIDE_SIZE);
    const works = withMedia.slice(0, FEED_SIZE);

    const cm = await db
      .from('comments')
      .select('id, post_id, author_name, content, created_at, posts!inner(boards!inner(slug))')
      .order('created_at', { ascending: false })
      .limit(COMMENT_SIZE);
    if (cm.error) throw cm.error;
    const comments: CommentSummary[] = ((cm.data ?? []) as unknown as {
      id: number; post_id: number; author_name: string; content: string; created_at: string;
      posts: { boards: { slug: string } | { slug: string }[] } | { boards: { slug: string } | { slug: string }[] }[];
    }[]).map((c) => {
      const post = Array.isArray(c.posts) ? c.posts[0] : c.posts;
      return { id: c.id, postId: c.post_id, board: slugOf(post?.boards as PostRow['boards']), author: c.author_name, text: excerpt(c.content, 60), createdAt: c.created_at };
    });

    const empty = works.length === 0 && Object.values(boards).every((l) => l.length === 0);
    // 아직 글이 하나도 없으면(막 만든 DB) 빈 화면 대신 예시를 보여준다
    return empty ? sample() : { isSample: false, slides, works, boards, comments };
  } catch {
    return sample();
  }
}
