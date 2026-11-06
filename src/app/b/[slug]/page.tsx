import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BOARDS, GRADE_LABEL, boardBySlug, type BoardInfo } from "@/lib/boards";
import { getBoardPosts } from "@/lib/data";

// 알려진 게시판만 미리 만든다
export function generateStaticParams() {
  return BOARDS.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const board = boardBySlug(slug);
  return { title: board?.title ?? "게시판" };
}

const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" });
// 2026. 11. 05. → 26.11.05
const shortDate = (iso: string) => date.format(new Date(iso)).replace(/\.\s*/g, ".").replace(/\.$/, "");

export default async function BoardPage({ params, searchParams }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const board = boardBySlug(slug);
  if (!board) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12">
      <nav className="mb-6 text-sm text-muted">
        <Link href="/" className="hover:text-fg">홈</Link> <span aria-hidden>/</span> {board.title}
      </nav>
      <h1 className="text-4xl font-black tracking-tight">{board.title}</h1>
      <p className="mt-2 text-sm text-muted">
        읽기: {board.readGrade ? `${GRADE_LABEL[board.readGrade]} 이상` : "누구나"} · 쓰기: {GRADE_LABEL[board.writeGrade]} 이상
      </p>

      <Suspense fallback={<p className="mt-10 text-center text-sm text-muted">불러오는 중…</p>}>
        <PostList slug={slug} board={board} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PostList({ slug, board, searchParams }: { slug: string; board: BoardInfo; searchParams: PageProps<"/b/[slug]">["searchParams"] }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(Array.isArray(pageParam) ? pageParam[0] : pageParam) || 1);
  const { posts, total, pageSize } = await getBoardPosts(slug, page);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  if (posts.length === 0) {
    return (
      <div className="mt-10 rounded-3xl border border-dashed border-line bg-surface p-12 text-center">
        <p className="text-lg font-bold">
          {board.readGrade ? `${GRADE_LABEL[board.readGrade]} 전용 게시판이에요.` : "아직 글이 없어요."}
        </p>
        {!board.readGrade && (
          <p className="mt-2 text-sm text-muted">Supabase와 기존 데이터를 연결하면 이 자리에 글이 나와요.</p>
        )}
      </div>
    );
  }

  return (
    <>
      <ul className="mt-8 divide-y divide-line/70 rounded-3xl border border-line bg-surface">
        {posts.map((p) => (
          <li key={p.id}>
            <Link href={`/b/${slug}/${p.id}`} className="flex items-baseline gap-2 px-5 py-3 text-sm transition-colors hover:text-accent">
              {p.isNotice && <span className="shrink-0 rounded bg-accent px-1.5 py-px text-[10px] font-bold text-white">공지</span>}
              <span className="truncate font-medium">{p.title}</span>
              {p.comments > 0 && <span className="shrink-0 text-xs font-bold text-accent-2">[{p.comments}]</span>}
              <span className="ml-auto hidden shrink-0 text-xs text-muted sm:inline">{p.author}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{shortDate(p.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {lastPage > 1 && (
        <nav className="mt-6 flex justify-center gap-1 text-sm" aria-label="페이지">
          {Array.from({ length: lastPage }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={n === 1 ? `/b/${slug}` : `/b/${slug}?page=${n}`}
              className={`rounded-md px-3 py-1 ${n === page ? "bg-accent font-bold text-white" : "text-muted hover:text-fg"}`}
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
