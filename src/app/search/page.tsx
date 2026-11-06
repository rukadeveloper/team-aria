import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = { title: "검색", robots: { index: false } };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-black tracking-tight">검색</h1>
      <Suspense fallback={<p className="mt-6 text-muted">불러오는 중…</p>}>
        <Query searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Query({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const { q } = await searchParams;
  const word = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 50);
  return (
    <div className="mt-6 rounded-3xl border border-dashed border-line bg-surface p-12 text-center">
      <p className="text-lg font-bold">{word ? `‘${word}’ 검색` : "검색어를 입력해주세요"}</p>
      <p className="mt-2 text-sm text-muted">검색은 글 데이터를 연결하면 사용할 수 있어요.</p>
    </div>
  );
}
