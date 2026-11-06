"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function login(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return "이메일과 비밀번호를 입력해주세요.";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return "이메일 또는 비밀번호가 올바르지 않습니다.";

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(_prev: string | undefined, formData: FormData): Promise<string | undefined> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!email || !password || !nickname) return "닉네임·이메일·비밀번호를 모두 입력해주세요.";
  if (password.length < 8) return "비밀번호는 8자 이상이어야 해요.";
  if (nickname.length > 20) return "닉네임은 20자 이하로 해주세요.";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { nickname } } });
  if (error) {
    if (error.code === "user_already_exists") return "이미 가입된 이메일이에요.";
    if (error.message.includes("Database error")) return "이미 사용 중인 닉네임이거나 가입 중 문제가 생겼어요. 닉네임을 바꿔서 다시 시도해주세요.";
    return error.message;
  }

  revalidatePath("/", "layout");
  // 이메일 인증을 끄둔 프로젝트면 가입과 동시에 로그인된다
  redirect(data.session ? "/" : "/login?signup=pending");
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
