"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/lib/auth-actions";

// 로그인 폼. compact=true 면 사이드바(LoginBox)에 넣을 때 쓰는, 제목·회원가입 링크를 뺀 버전
export default function LoginForm({ compact = false }: { compact?: boolean }) {
  const [error, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} className={compact ? "mt-3 space-y-2" : "mx-auto mt-10 max-w-sm space-y-3 rounded-3xl border border-line bg-surface p-6"}>
      {!compact && <h1 className="text-xl font-black">로그인</h1>}
      <input name="email" type="email" required autoComplete="email" placeholder="이메일" aria-label="이메일" className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm" />
      <input name="password" type="password" required autoComplete="current-password" placeholder="비밀번호" aria-label="비밀번호" className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm" />
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
      <button type="submit" disabled={pending} className="h-10 w-full rounded-xl bg-gradient-to-r from-accent to-accent-2 text-sm font-bold text-white disabled:opacity-60">
        {pending ? "로그인 중…" : "로그인"}
      </button>
      {!compact && (
        <p className="text-center text-xs text-muted">
          계정이 없으신가요? <Link href="/signup" className="font-bold text-accent hover:underline">회원가입</Link>
        </p>
      )}
    </form>
  );
}
