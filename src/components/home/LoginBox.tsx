import Link from "next/link";

// 사이드바 로그인 상자. 로그인 기능이 붙기 전까지는 입력을 막아 두고 안내만 보여준다
export default function LoginBox() {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <h2 className="text-base font-black">로그인</h2>
      <form className="mt-3 space-y-2" aria-describedby="login-soon">
        <input disabled placeholder="아이디" aria-label="아이디" className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm disabled:cursor-not-allowed" />
        <input disabled type="password" placeholder="비밀번호" aria-label="비밀번호" className="h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm disabled:cursor-not-allowed" />
        <label className="flex items-center gap-2 text-xs text-muted">
          <input disabled type="checkbox" /> 로그인 유지
        </label>
        <button type="button" disabled className="h-10 w-full rounded-xl bg-gradient-to-r from-accent to-accent-2 text-sm font-bold text-white opacity-50">
          로그인
        </button>
      </form>
      <p id="login-soon" className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-xs text-muted">로그인·회원가입은 준비 중이에요.</p>
      <p className="mt-3 flex justify-center gap-2 text-xs text-muted">
        <Link href="/" className="pointer-events-none opacity-60">회원가입</Link>
        <span aria-hidden>|</span>
        <Link href="/" className="pointer-events-none opacity-60">ID/PW 찾기</Link>
      </p>
    </section>
  );
}
