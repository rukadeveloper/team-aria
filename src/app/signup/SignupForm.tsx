"use client";

import { useActionState } from "react";
import { signup } from "@/lib/auth-actions";

export default function SignupForm() {
  const [error, formAction, pending] = useActionState(signup, undefined);

  return (
    <form action={formAction} className="mx-auto mt-10 max-w-sm space-y-3 rounded-3xl border border-line bg-surface p-6">
      <h1 className="text-xl font-black">회원가입</h1>
      <input name="nickname" required maxLength={20} placeholder="닉네임" aria-label="닉네임" className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm" />
      <input name="email" type="email" required autoComplete="email" placeholder="이메일" aria-label="이메일" className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm" />
      <input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="비밀번호 (8자 이상)" aria-label="비밀번호" className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm" />
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
      <button type="submit" disabled={pending} className="h-10 w-full rounded-xl bg-gradient-to-r from-accent to-accent-2 text-sm font-bold text-white disabled:opacity-60">
        {pending ? "가입 중…" : "회원가입"}
      </button>
    </form>
  );
}
