"use client";

import { Suspense } from "react";
import ScreenshotsPage from "@/components/screenshots/ScreenshotsPage";

/**
 * 스크린샷 (STARLOG 게임 + 외부 폴더) — 정적 내보내기라 동적 경로가 없다: `?entry=57` · `?source=<id>&group=<key>`.
 * useSearchParams는 프리렌더 때 값을 모르므로 Suspense 경계가 필요하다
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ScreenshotsPage />
    </Suspense>
  );
}
