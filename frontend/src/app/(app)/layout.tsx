"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AppHeader from "@/components/layout/AppHeader";
import TaskToasts from "@/components/layout/TaskToasts";
import { getBridge } from "@/lib/desktop";
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
  const router = useRouter();

  /*
   * 백엔드가 혼자 죽으면 입구로 돌아간다.
   *
   * 예전엔 일렉트론이 **문서를 통째로 다시 로드**해서 이 구독이 필요 없었다. 대신 그때마다
   * 검은 화면이 번쩍이고 진행 중이던 알림이 사라졌다. 이제는 라우팅만 하므로
   * `TaskToasts`가 살아남아 "어디까지 됐는지"를 입구에서도 계속 보여준다
   */
  useEffect(() => getBridge()?.onGoEntry(() => router.push("/")), [router]);

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
