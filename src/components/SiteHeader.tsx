import Link from "next/link";
import Logo from "./Logo";
import { BOARD_GROUPS, BOARDS } from "@/lib/boards";

// 상단 메뉴: 묶음마다 드롭다운. 마우스뿐 아니라 키보드(Tab)로 포커스해도 열린다
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[5.5rem] w-full max-w-6xl items-center justify-between gap-4 px-4 md:h-28">
        <Logo />

        <nav aria-label="주요 메뉴" className="hidden items-center gap-1 md:flex">
          {BOARD_GROUPS.map((g) => (
            <div key={g.key} className="group relative">
              <button type="button" className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-fg focus-visible:text-fg">
                {g.title}
              </button>
              <div className="invisible absolute left-0 top-full min-w-44 pt-2 opacity-0 transition-all group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <ul className="rounded-2xl border border-line bg-surface p-2 shadow-xl">
                  {BOARDS.filter((b) => b.group === g.key).map((b) => (
                    <li key={b.slug}>
                      <Link href={`/b/${b.slug}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-accent-soft">
                        {b.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </nav>

        <form action="/search" role="search" className="hidden lg:block">
          <label htmlFor="site-search" className="sr-only">검색</label>
          <div className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm focus-within:border-accent">
            <input id="site-search" name="q" type="search" maxLength={50} placeholder="검색" className="w-32 bg-transparent outline-none placeholder:text-muted" />
            <button type="submit" aria-label="검색" className="text-muted hover:text-accent">⌕</button>
          </div>
        </form>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-line px-3 py-1.5 text-xs text-muted sm:inline">로그인은 준비 중</span>
        </div>
      </div>
    </header>
  );
}
