import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 서버(Server Component·Action·Route Handler)에서 쓰는 클라이언트. 요청의 쿠키로 로그인 상태를 읽는다.
// Server Component 안에서는 쿠키를 쓸 수 없어 setAll 이 실패할 수 있는데, 미들웨어가 세션을 갱신해 주므로 무시해도 된다.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component에서 호출된 경우. 미들웨어가 세션을 갱신하므로 무시한다.
        }
      },
    },
  });
}
