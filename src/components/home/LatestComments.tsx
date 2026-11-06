"use client";

import Link from "next/link";
import { useState } from "react";
import type { CommentSummary } from "@/lib/data";

const PER_PAGE = 4;

// 사이드바 '최신 댓글' — 기존 사이트처럼 [1/3] 페이지로 넘겨 본다
export default function LatestComments({ comments }: { comments: CommentSummary[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(comments.length / PER_PAGE));
  const shown = comments.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-black">최신 댓글</h2>
        <div className="flex items-center gap-1 text-xs text-muted" aria-live="polite">
          <button type="button" aria-label="이전 댓글" disabled={page === 0} onClick={() => setPage(page - 1)} className="grid size-6 place-items-center rounded-md hover:bg-surface-2 disabled:opacity-30">‹</button>
          <span>{page + 1} / {pages}</span>
          <button type="button" aria-label="다음 댓글" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="grid size-6 place-items-center rounded-md hover:bg-surface-2 disabled:opacity-30">›</button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">아직 댓글이 없어요.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((c) => (
            <li key={c.id}>
              <Link href={`/b/${c.board}`} className="flex gap-3 rounded-xl p-1 transition-colors hover:bg-accent-soft">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-sm font-black text-white" aria-hidden>
                  {c.author.slice(0, 1)}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-muted">{c.author}</span>
                  <span className="line-clamp-2 text-sm">{c.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
