"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PostSummary } from "@/lib/data";

// 이미지가 없는 슬라이드용 배경 (사이트 색에서 만든 그라데이션)
const BG = [
  "from-violet-600 to-fuchsia-500",
  "from-pink-500 to-orange-400",
  "from-sky-500 to-violet-500",
  "from-emerald-500 to-sky-500",
  "from-rose-500 to-violet-600",
];

const INTERVAL = 5500;

// 메인 상단 '아리아 소식' 이미지 슬라이드. 마우스를 올리거나 포커스하면 멈추고, 동작 줄이기 설정이면 자동 넘김이 없다
export default function HeroSlider({ slides }: { slides: PostSummary[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const go = useCallback((n: number) => setIndex((n + count) % count), [count]);

  useEffect(() => {
    // 동작 줄이기 설정이면 자동으로 넘기지 않는다 (직접 누를 때만)
    if (paused || count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL);
    return () => clearInterval(t);
  }, [paused, count]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="아리아 소식"
      className="group relative overflow-hidden rounded-3xl border border-line bg-surface"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="flex transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)]" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((s, i) => (
          <Link
            key={s.id}
            href={`/b/${s.board}`}
            aria-hidden={i !== index}
            tabIndex={i === index ? 0 : -1}
            className={`relative block aspect-video w-full shrink-0 bg-gradient-to-br ${BG[i % BG.length]}`}
          >
            {s.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.thumbnail} alt="" className="absolute inset-0 size-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-8">
              <span className="mb-2 inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">아리아 소식</span>
              <h2 className="line-clamp-2 text-xl font-black leading-snug md:text-3xl">{s.title}</h2>
              {s.summary && <p className="mt-2 line-clamp-1 hidden text-sm text-white/80 md:block">{s.summary}</p>}
            </div>
          </Link>
        ))}
      </div>

      {count > 1 && (
        <>
          <button type="button" aria-label="이전 슬라이드" onClick={() => go(index - 1)} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100">
            ‹
          </button>
          <button type="button" aria-label="다음 슬라이드" onClick={() => go(index + 1)} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition-opacity focus-visible:opacity-100 group-hover:opacity-100">
            ›
          </button>
          <div className="absolute right-4 top-4 flex gap-1.5" role="tablist" aria-label="슬라이드 선택">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`${i + 1}번 슬라이드`}
                onClick={() => go(i)}
                className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
