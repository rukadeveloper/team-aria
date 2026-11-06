import Link from "next/link";

// 팀 아리아 로고 (기존 사이트의 로고 이미지를 그대로 사용: public/logo.png, 투명 배경)
export default function Logo() {
  return (
    <Link href="/" aria-label="팀 아리아 홈" className="inline-flex items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="팀 아리아" width={232} height={80} className="h-16 w-auto md:h-20" />
    </Link>
  );
}
