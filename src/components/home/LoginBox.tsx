import Link from "next/link";
import LoginForm from "@/app/login/LoginForm";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/auth-actions";
import { GRADE_LABEL } from "@/lib/boards";

// 사이드바 로그인 상자. 로그인했으면 닉네임·등급·포인트를 보여준다
export default async function LoginBox() {
  const user = await getCurrentUser();

  if (user) {
    return (
      <section className="rounded-3xl border border-line bg-surface p-5">
        <h2 className="text-base font-black">{user.nickname}님</h2>
        <p className="mt-1 text-xs text-muted">{GRADE_LABEL[user.grade]} · {user.points}P</p>
        <form action={logout} className="mt-3">
          <button type="submit" className="h-10 w-full rounded-xl border border-line text-sm font-bold text-muted transition-colors hover:text-fg">
            로그아웃
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <h2 className="text-base font-black">로그인</h2>
      <LoginForm compact />
      <p className="mt-3 flex justify-center gap-2 text-xs text-muted">
        <Link href="/signup" className="hover:text-fg">회원가입</Link>
      </p>
    </section>
  );
}
