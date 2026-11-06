import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BOARDS, GRADE_LABEL, boardBySlug } from "@/lib/boards";

// 알려진 게시판만 미리 만든다
export function generateStaticParams() {
  return BOARDS.map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const board = boardBySlug(slug);
  return { title: board?.title ?? "게시판" };
}

export default async function BoardPage({ params }: PageProps<"/b/[slug]">) {
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

      <div className="mt-10 rounded-3xl border border-dashed border-line bg-surface p-12 text-center">
        <p className="text-lg font-bold">글 목록은 곧 연결됩니다</p>
        <p className="mt-2 text-sm text-muted">Supabase와 기존 데이터를 연결하면 이 자리에 글이 나와요.</p>
      </div>
    </main>
  );
}
