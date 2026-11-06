import type { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "회원가입" };

export default function SignupPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12">
      <SignupForm />
    </main>
  );
}
