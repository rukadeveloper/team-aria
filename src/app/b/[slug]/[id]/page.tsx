import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { boardBySlug } from "@/lib/boards";
import { getPost } from "@/lib/data";
import { cleanHtml } from "@/lib/sanitize";
import CommentTree from "@/components/post/CommentTree";

// id 는 미리 알 수 없어 정적으로 만들 수 없다. 막힘(blocking) 렌더링으로 처리해 notFound() 의 404 상태코드가 제대로 나가게 한다
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/b/[slug]/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const result = await getPost(slug, Number(id));
  return { title: result?.post.title ?? "글" };
}

const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function PostPage({ params }: PageProps<"/b/[slug]/[id]">) {
  const { slug, id } = await params;
  const board = boardBySlug(slug);
  if (!board) notFound();

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const result = await getPost(slug, numericId);
  if (!result) notFound();
  const { post, comments } = result;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <nav className="mb-6 text-sm text-muted">
        <Link href="/" className="hover:text-fg">홈</Link> <span aria-hidden>/</span>{" "}
        <Link href={`/b/${slug}`} className="hover:text-fg">{board.title}</Link>
      </nav>

      <header className="border-b border-line pb-5">
        <h1 className="text-2xl font-black leading-snug">
          {post.isNotice && <span className="mr-2 align-middle rounded bg-accent px-1.5 py-px text-xs font-bold text-white">공지</span>}
          {post.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="font-bold text-fg">{post.author}</span>
          <span>{date.format(new Date(post.createdAt))}</span>
          <span>조회 {post.viewCount}</span>
          <span>댓글 {post.commentCount}</span>
        </div>
        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map((t) => (
              <span key={t} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">#{t}</span>
            ))}
          </div>
        )}
      </header>

      {post.credits && post.credits.length > 0 && (
        <table className="mt-6 w-full overflow-hidden rounded-2xl border border-line text-sm">
          <tbody className="divide-y divide-line">
            {post.credits.map((c, i) => (
              <tr key={i} className="divide-x divide-line">
                <th scope="row" className="w-28 bg-surface-2 px-3 py-2 text-left font-bold text-muted">{c.label}</th>
                <td className="px-3 py-2">
                  {c.link ? (
                    <a href={c.link} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">{c.value}</a>
                  ) : (
                    c.value
                  )}
                  {c.memberOnly && <span className="ml-2 text-xs text-muted">(회원 전용)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="prose mt-6 max-w-none break-words text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: cleanHtml(post.content) }} />

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="mb-4 text-base font-black">댓글 {post.commentCount}개</h2>
        <CommentTree comments={comments} />
      </section>

      <div className="mt-8">
        <Link href={`/b/${slug}`} className="text-sm font-bold text-accent hover:underline">← 목록으로</Link>
      </div>
    </main>
  );
}
