"use client";

import AppHeader from "@/components/layout/AppHeader";
import TaskToasts from "@/components/layout/TaskToasts";
import { useSession } from "@/lib/session";

/**
 * 앱 구역. 헤더는 fixed라 본문이 그 아래로 흐른다 —
 * 상세 화면의 배너가 헤더 뒤까지 덮으려면 본문이 헤더에 밀리면 안 된다.
 *
 * ## v1.0에서 문지기가 사라졌다
 *
 * 예전엔 `guest`면 `/login`으로 보냈다. 로그인이 없어졌으니 보낼 곳도 없다.
 * 남은 건 **기다림**이다 — 프로필(`/api/me`)이 도착해야 닉네임·배경색이 그려진다.
 * 일렉트론에서는 백엔드가 뜨는 몇 초 동안 여기가 `loading`으로 머문다.
 *
 * 빈 화면을 그리지 않는 이유는 그대로다 — 빈 목록이 잠깐 스쳤다 채워지면 어수선하다
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();

  if (session.status !== "member") return null;

  return (
    <>
      <AppHeader />
      <div className="h-full w-full">{children}</div>
      {/*
        오래 걸리는 일의 진행·결과. **껍데기에 붙는 게 요점이다** —
        화면을 옮겨도 이 컴포넌트는 안 죽어서 진행이 이어 보인다 (2026-08-28)
      */}
      <TaskToasts />
    </>
  );
}
