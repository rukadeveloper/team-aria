import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "로그인" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12">
      <Suspense fallback={null}>
        <SignupNotice searchParams={searchParams} />
      </Suspense>
      <LoginForm />
    </main>
  );
}

async function SignupNotice({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { signup } = await searchParams;
  if (signup !== "pending") return null;
  return (
    <p className="mx-auto mb-6 max-w-sm rounded-2xl border border-dashed border-line bg-surface px-4 py-3 text-center text-sm text-muted">
      가입 확인 메일을 보냈어요. 메일의 링크를 눌러 인증을 완료해주세요.
    </p>
  );
}
