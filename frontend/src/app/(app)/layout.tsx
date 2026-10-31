"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppHeader from "@/components/layout/AppHeader";
import CardStatsHost from "@/components/library/CardStatsHost";
import TaskToasts from "@/components/layout/TaskToasts";
import { Button } from "@/components/ui/Field";
import { useCloudBackupToasts } from "@/lib/cloudBackup";
import { getBridge } from "@/lib/desktop";
import { useIngestToasts } from "@/lib/ingest";
import { rememberAppPath } from "@/lib/lastAppPath";
import { attachMediaEvents } from "@/lib/mediaEvents";
import { refreshSession, useSession } from "@/lib/session";

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
 * 빈 화면을 그리지 않는 이유는 그대로다 — 빈 목록이 잠깐 스쳤다 채워지면 어수선하다.
 *
 * ⚠️ **기다림에는 끝이 있다** (2026-10-25). API 토큰·Host 검사가 들어간 뒤로는 401/403·네트워크 실패가
 * 실제로 나는 길이라, 답이 안 오면 검은 화면에서 새로고침 말고 할 수 있는 게 없었다.
 * 거절(guest)이면 바로, 답이 없으면 8초 뒤 이유와 [다시 시도]·[입구로]를 보여준다
 */
const STUCK_AFTER_MS = 8_000;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();

  // 배경 썸네일 진행·폴더 감시 알림 (일렉트론). 문서에 한 번만 붙는다
  useEffect(() => attachMediaEvents(), []);

  /*
   * 백엔드가 혼자 죽으면 입구로 돌아간다.
   *
   * 예전엔 일렉트론이 **문서를 통째로 다시 로드**해서 이 구독이 필요 없었다. 대신 그때마다
   * 검은 화면이 번쩍이고 진행 중이던 알림이 사라졌다. 이제는 라우팅만 하므로
   * `TaskToasts`가 살아남아 "어디까지 됐는지"를 입구에서도 계속 보여준다
   */
  useEffect(
    () =>
      getBridge()?.onGoEntry(() => {
        /*
         * ⚠️ **나가기 전에 어디였는지 담아둔다** (2026-08-29).
         * 입구의 [최근 접속]이 이 경로로 돌아온다 — 백엔드는 안 죽었으므로
         * 대시보드로 되돌리면 보던 것을 잃는다
         */
        rememberAppPath(window.location.pathname + window.location.search);
        router.push("/");
      }),
    [router],
  );

  // 자동 백업은 기동 직후 뒤에서 돈다 — 껍데기가 받아야 어느 화면에 있든 결과가 뜬다
  useCloudBackupToasts();
  // 스크린샷 넣기는 몇 분 걸릴 수 있다 — 화면을 옮겨도 진행·결과가 보이게 껍데기에 붙인다
  useIngestToasts();

  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (session.status === "member") return;
    const timer = setTimeout(() => setStuck(true), session.status === "guest" ? 0 : STUCK_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setStuck(false);
    };
  }, [session.status]);

  if (session.status !== "member") {
    if (!stuck) return null;
    return (
      <div className="flex h-full w-full items-center justify-center px-4">
        <div className="glass-panel w-full max-w-md rounded-xl !bg-neutral-950/92 px-6 py-7 text-center">
          <p className="text-sm font-medium text-red-300">
            {session.status === "guest" ? "앱 서버가 이 화면의 요청을 거절했습니다" : "앱 서버의 답이 없습니다"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/45">
            다시 시도해 보시고, 그래도 안 되면 입구로 나가 다시 들어와 주세요.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={() => void refreshSession()}>다시 시도</Button>
            <Button
              variant="primary"
              onClick={() => {
                const bridge = getBridge();
                if (bridge) void bridge.backToEntry();
                else router.push("/");
              }}
            >
              입구로
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppHeader />
      <div className="h-full w-full">{children}</div>
      {/*
        오래 걸리는 일의 진행·결과. **껍데기에 붙는 게 요점이다** —
        화면을 옮겨도 이 컴포넌트는 안 죽어서 진행이 이어 보인다 (2026-08-28)
      */}
      <TaskToasts />
      <CardStatsHost />
    </>
  );
}
