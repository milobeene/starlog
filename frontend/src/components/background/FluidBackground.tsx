"use client";

import { usePathname } from "next/navigation";
import FluidCanvas from "./FluidCanvas";
import { useSession } from "@/lib/session";
import { paletteOf } from "@/lib/palette";

/**
 * 서비스의 아이덴티티 — 유체 흐름 + 필름 그레인. 전역에 한 장만 깔린다.
 *
 * uAppState 하나로 두 얼굴을 만든다:
 *   0.0 = 입구 페이지 — 원색, 무지개 순회, 빠름
 *   1.0 = 앱 내부     — 어둡고 탈채도, 느림 (본문이 읽혀야 하므로)
 *
 * 라우트가 바뀌면 목표값만 갈아끼우고 렌더 루프가 프레임마다 5%씩 따라간다.
 * 즉시 전환하면 화면이 번쩍인다.
 *
 * **색은 회원 설정에서 온다.** 비로그인·미설정이면 기본 팔레트다 —
 * 입구 페이지는 로그인 전에도 그려져야 하므로 그 경로가 반드시 성립해야 한다.
 * 셰이더 구동은 FluidCanvas가 하고, 여기는 "어떤 색으로, 어떤 얼굴로"만 정한다
 */
export default function FluidBackground() {
  const pathname = usePathname();
  const session = useSession();

  return (
    <FluidCanvas
      colors={paletteOf(session.me?.profile.backgroundColors)}
      targetAppState={pathname === "/" ? 0 : 1}
      className="pointer-events-none fixed inset-0 z-0 h-screen w-screen"
    />
  );
}
