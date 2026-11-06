import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// 모든 요청마다 로그인 세션(쿠키)을 갱신한다. 이게 없으면 액세스 토큰 만료 후 로그인 상태가 끊길 수 있다.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // 세션을 실제로 읽어야 만료된 토큰이 갱신된다 (쓰지 않으면 갱신된 쿠키가 버려짐)
  await supabase.auth.getUser();

  return response;
}
