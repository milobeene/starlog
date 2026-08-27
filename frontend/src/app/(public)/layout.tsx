"use client";

import TaskToasts from "@/components/layout/TaskToasts";

/**
 * 입구 구역 — 헤더도 메뉴도 없다.
 *
 * 알림은 여기도 붙인다. **연결 테스트가 입구에서도 오래 걸린다** —
 * 팝업을 닫고 목록으로 돌아가도 결과를 볼 수 있어야 한다
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      {children}
      <TaskToasts />
    </div>
  );
}
