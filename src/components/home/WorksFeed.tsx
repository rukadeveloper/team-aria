import Link from "next/link";
import { boardBySlug } from "@/lib/boards";
import type { PostSummary } from "@/lib/data";

const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const GRAD = ["from-violet-500 to-fuchsia-500", "from-pink-500 to-orange-400", "from-sky-500 to-violet-500", "from-emerald-500 to-sky-500"];

// '작품' 피드: 대표 이미지 · 제목 · 요약 · 작성자와 날짜 (기존 메인의 작품 카드 목록)
export default function WorksFeed({ works }: { works: PostSummary[] }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-black">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-accent to-accent-2" aria-hidden />
          새로 올라온 작품
        </h2>
        <Link href="/b/works" className="text-xs font-bold text-accent hover:underline">
          더보기 +
        </Link>
      </div>

      {works.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">아직 작품이 없어요.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {works.map((w, i) => (
            <li key={w.id}>
              <Link href={`/b/${w.board}`} className="lift flex h-full gap-3 rounded-2xl border border-line bg-bg p-3">
                <div className={`relative size-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br ${GRAD[i % GRAD.length]} sm:size-24`}>
                  {w.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.thumbnail} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center text-2xl font-black text-white/90" aria-hidden>♪</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <h3 className="line-clamp-1 text-sm font-bold">
                    {w.title}
                    {w.comments > 0 && <span className="ml-1 text-xs text-accent-2">[{w.comments}]</span>}
                  </h3>
                  {w.summary && <p className="mt-1 line-clamp-2 text-xs text-muted">{w.summary}</p>}
                  <p className="mt-auto pt-2 text-[11px] text-muted">
                    <span className="mr-1.5 rounded bg-accent-soft px-1.5 py-px font-bold text-accent">{boardBySlug(w.board)?.title ?? w.board}</span>
                    {w.author} · {date.format(new Date(w.createdAt)).replace(/\.\s*/g, ".").replace(/\.$/, "")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
