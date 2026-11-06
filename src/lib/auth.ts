import { createClient } from "@/lib/supabase/server";
import type { Grade } from "@/lib/boards";

export interface CurrentUser {
  id: string;
  nickname: string;
  grade: Grade;
  points: number;
}

// 로그인한 사용자 + 프로필. 비로그인이면 null
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("nickname, grade, points").eq("id", user.id).single();
  if (!profile) return null;

  return { id: user.id, nickname: profile.nickname, grade: profile.grade as Grade, points: profile.points };
}
