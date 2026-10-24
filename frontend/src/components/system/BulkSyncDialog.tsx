"use client";

import type { MutableRefObject } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { runBulkSync } from "@/components/system/bulkSync";
import type { GameMaster } from "@/lib/types";

/**
 * 일괄 동기화 승인 (§10-2). 대상 목록을 먼저 보여준다 —
 * "몇 개를 얼마나 오래" 돌릴지 모르고 시작하면 중간에 끊고 싶어진다.
 *
 * `abort`는 부모가 들고 있다 — 이 다이얼로그는 승인 직후 닫히지만 동기화는 계속 도는데,
 * 알림의 [중단]이 그 ref를 건드려야 하기 때문이다
 */
export default function BulkSyncDialog({
  syncTargets,
  abort,
  onClose,
  onDone,
}: {
  syncTargets: GameMaster[];
  abort: MutableRefObject<boolean>;
  onClose: () => void;
  /** 동기화가 끝난 뒤 목록을 새로 읽는다 */
  onDone: () => void;
}) {
  return (
    <ConfirmDialog
      title="일괄 동기화"
      confirmLabel={syncTargets.length > 0 ? "동기화" : "확인"}
      message={
        syncTargets.length === 0 ? (
          "동기화할 게임이 없습니다. 3개월이 지난 IGDB 게임만 대상입니다."
        ) : (
          <>
            마지막 동기화가 3개월이 지난 <b className="text-white">{syncTargets.length}개</b>를
            최신 정보로 갱신합니다. 한 건씩 차례로 부르므로 시간이 걸립니다.
            <span className="mt-3 block max-h-40 overflow-y-auto rounded-md border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-white/50">
              {syncTargets.map((g) => g.name).join(" · ")}
            </span>
            <span className="mt-2 block text-[11px] text-white/30">
              중간에 닫으셔도 됩니다. 다시 누르면 남은 것만 다시 잡힙니다.
            </span>
          </>
        )
      }
      onClose={onClose}
      onConfirm={async () => {
        const targets = syncTargets;
        onClose();
        if (targets.length === 0) return;

        await runBulkSync(targets, abort);
        onDone();
      }}
    />
  );
}
