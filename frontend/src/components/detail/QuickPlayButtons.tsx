"use client";

import { useState } from "react";
import type { DetailDialog } from "@/components/detail/detailDialog";
import { actionsFor, QUICK_ACTION_LABEL, runQuickAction, type QuickAction } from "@/lib/quickPlay";
import type { BacklogDetail } from "@/lib/types";

/**
 * 상세 헤더의 한 번 누르기 버튼 (v2 U2). 상태 배지 옆에 붙는다.
 *
 * 확인창은 없다 — 시작·일시정지·재개는 가볍고, 완료·중단도 상세의 회차 팝업에서 되돌릴 수 있다.
 * [완료]만 이어서 점수·플레이타임 팝업을 연다: 깼을 때가 "평점 · 이번에 한 시간"을 제일 잘 아는 순간이다
 */
export default function QuickPlayButtons({
  data,
  onOpen,
}: {
  data: BacklogDetail;
  onOpen: (dialog: DetailDialog) => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async (action: QuickAction) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await runQuickAction(data.entryId, action);
      if (ok && action === "complete") onOpen({ kind: "stats" });
    } finally {
      setBusy(false);
    }
  };

  const actions = actionsFor(data.status);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((action, index) => (
        <button
          key={action}
          type="button"
          disabled={busy}
          onClick={() => run(action)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${
            index === 0
              ? "bg-white text-black hover:bg-white/85"
              : "border border-white/20 bg-black/30 text-white/80 backdrop-blur-sm hover:bg-white/10 hover:text-white"
          }`}
        >
          {QUICK_ACTION_LABEL[action]}
        </button>
      ))}
    </div>
  );
}
