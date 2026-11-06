import Link from "next/link";
import type { PostSummary } from "@/lib/data";

const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" });
// 2026. 11. 05. → 26.11.05
const shortDate = (iso: string) => date.format(new Date(iso)).replace(/\.\s*/g, ".").replace(/\.$/, "");

// 게시판 최신글 목록 위젯 (공지사항, 자유 게시판 …). 제목 · 댓글 수 · 글쓴이 · 날짜
export default function BoardWidget({ slug, title, posts, memberOnly }: { slug: string; title: string; posts: PostSummary[]; memberOnly?: string }) {
  return (
    <section className="flex flex-col rounded-3xl border border-line bg-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-black">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-accent to-accent-2" aria-hidden />
          {title}
          {memberOnly && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">{memberOnly}</span>}
        </h2>
        <Link href={`/b/${slug}`} className="text-xs font-bold text-accent hover:underline">
          더보기 +
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="grid flex-1 place-items-center py-10 text-center text-sm text-muted">
          {memberOnly ? `${memberOnly} 게시판이에요. 로그인하면 볼 수 있어요.` : "아직 글이 없어요."}
        </p>
      ) : (
        <ul className="divide-y divide-line/70">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/b/${p.board || slug}`} className="flex items-baseline gap-2 py-2 text-sm transition-colors hover:text-accent">
                {p.isNotice && <span className="shrink-0 rounded bg-accent px-1.5 py-px text-[10px] font-bold text-white">공지</span>}
                <span className="truncate font-medium">{p.title}</span>
                {p.comments > 0 && <span className="shrink-0 text-xs font-bold text-accent-2">[{p.comments}]</span>}
                <span className="ml-auto hidden shrink-0 text-xs text-muted sm:inline">{p.author}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{shortDate(p.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
