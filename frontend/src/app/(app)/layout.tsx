"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import { useSession } from "@/lib/session";

/**
 * 로그인 구역. 헤더는 fixed라 본문이 그 아래로 흐른다 —
 * 상세 화면의 배너가 헤더 뒤까지 덮으려면 본문이 헤더에 밀리면 안 된다.
 *
 * **여기서 막는 건 UX일 뿐이다.** 진짜 방어선은 서버의 401/403이고,
 * 정적으로 내려가는 화면이라 숨기는 것 자체는 보안이 아니다.
 * 그래도 껍데기만 남은 화면을 보여주느니 로그인으로 보내는 편이 낫다
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.status === "guest") {
      // 로그인 뒤 돌아올 자리를 남긴다
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [session.status, router, pathname]);

  // 판정 중과 비로그인은 화면을 그리지 않는다 — 빈 목록이 잠깐 스쳤다 사라지면 어수선하다
  if (session.status !== "member") return null;

  return (
    <>
      <AppHeader />
      <div className="h-full w-full">{children}</div>
    </>
  );
}
