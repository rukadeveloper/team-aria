import { Suspense } from "react";
import BoardWidget from "@/components/home/BoardWidget";
import HeroSlider from "@/components/home/HeroSlider";
import LatestComments from "@/components/home/LatestComments";
import LoginBox from "@/components/home/LoginBox";
import WorksFeed from "@/components/home/WorksFeed";
import { HOME_BOARDS, getHome } from "@/lib/data";

// 기존 사이트 메인과 같은 구성: 왼쪽 메인(소식 슬라이드 → 작품 → 게시판 목록들) + 오른쪽 사이드바(로그인·최신 댓글·소셜)
export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Suspense fallback={<HomeSkeleton />}>
        <HomeContent />
      </Suspense>
    </main>
  );
}

async function HomeContent() {
  const home = await getHome();
  const list = (slug: string) => HOME_BOARDS.find((b) => b.slug === slug)!;

  return (
    <>
      <div className="space-y-6">
        {home.isSample && (
          <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
            지금 보이는 글은 화면 확인용 <b>예시</b>입니다. Supabase를 연결하고 기존 데이터를 옮기면 실제 글이 나와요.
          </p>
        )}
        <HeroSlider slides={home.slides} />
        <WorksFeed works={home.works} />

        <div className="grid gap-6 md:grid-cols-2">
          {(["notice", "toon", "free", "request", "works", "collab"] as const).map((slug) => (
            <BoardWidget key={slug} slug={slug} title={list(slug).title} posts={home.boards[slug] ?? []} memberOnly={"memberOnly" in list(slug) ? (list(slug) as { memberOnly: string }).memberOnly : undefined} />
          ))}
        </div>
      </div>

      <aside className="space-y-6" aria-label="사이드바">
        <LoginBox />
        <LatestComments comments={home.comments} />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <h2 className="text-base font-black">팀 아리아 소식</h2>
          <p className="mt-2 text-sm text-muted">새 작품과 공지는 공식 트위터에서도 만나보세요.</p>
          <a href="https://twitter.com/team_aria1" target="_blank" rel="noopener noreferrer" className="mt-4 flex h-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-sm font-bold transition-colors hover:border-accent hover:text-accent">
            @team_aria1 트위터 열기 ↗
          </a>
        </section>
      </aside>
    </>
  );
}

function HomeSkeleton() {
  return (
    <>
      <div className="space-y-6" aria-busy="true">
        <div className="aspect-video animate-pulse rounded-3xl bg-surface-2" />
        <div className="h-64 animate-pulse rounded-3xl bg-surface-2" />
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-60 animate-pulse rounded-3xl bg-surface-2" />
          ))}
        </div>
      </div>
      <div className="space-y-6">
        <div className="h-64 animate-pulse rounded-3xl bg-surface-2" />
        <div className="h-72 animate-pulse rounded-3xl bg-surface-2" />
      </div>
    </>
  );
}
