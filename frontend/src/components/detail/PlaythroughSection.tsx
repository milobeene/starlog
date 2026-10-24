"use client";

import Unit from "@/components/ui/Unit";
import SectionIcon from "@/components/ui/SectionIcon";
import DataTable from "@/components/library/DataTable";
import { Button } from "@/components/ui/Field";
import type { DetailDialog } from "@/components/detail/detailDialog";
import { PLAYTHROUGH_STATUS_LABEL } from "@/lib/labels";
import type { Playthrough } from "@/lib/types";

const PLAYTHROUGH_TONE: Record<string, string> = {
  PLAYING: "text-green-400",
  COMPLETED: "text-blue-400",
  PAUSED: "text-yellow-400",
  DROPPED: "text-red-400",
};

export default function PlaythroughSection({
  playthroughs,
  ongoingRun,
  onOpen,
}: {
  playthroughs: Playthrough[];
  /** 종료일이 비어 있는 회차 — 있으면 새 회차를 못 더한다 */
  ongoingRun: Playthrough | null;
  onOpen: (dialog: DetailDialog) => void;
}) {
  return (
    <section>
      <h3 className="mb-4 flex items-center justify-between gap-3 text-base font-medium text-white/90 sm:text-lg">
        <span className="flex items-center gap-2">
          <SectionIcon name="play" />
          Playthrough Records
        </span>
        <span className="flex items-center gap-3">
          <span className="num text-xs text-white/30">
              {playthroughs.length}
              <Unit space>runs</Unit>
            </span>
          {/*
            **진행 중인 회차가 있으면 못 더한다** (v1.2). 서버가 BR-PT-03으로
            이미 막지만(409), 누른 뒤 다이얼로그를 다 채우고서야 거절당했다.
            판정 기준은 서버와 같은 **종료일 없음**이다 — 상태가 아니다
          */}
          <Button
            onClick={() => onOpen({ kind: "playthrough", run: null })}
            disabled={ongoingRun != null}
            title={
              ongoingRun
                ? `${ongoingRun.sequenceNo}회차가 진행 중입니다`
                : undefined
            }
          >
            회차 추가
          </Button>
        </span>
      </h3>
      {/*
        **Device 칸을 뺐다** (2026-08-28). 다섯 칸이 들어가니 노트북 폭에서
        `2024-03-13 ~ 2025-07-21`이 두 줄로 쪼개지고 `1회차`까지 접혔다.
        기기 이름은 계정 라벨에 이미 붙어 있어서(`Beene (한성컴퓨터 PC)`)
        같은 정보를 두 칸이 나눠 갖고 있던 셈이다 — 합치면 기간이 한 줄에 들어간다
      */}
      {ongoingRun && (
        <p className="mb-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50">
          <span className="num text-white/70">{ongoingRun.sequenceNo}</span>회차가 진행
          중입니다. 종료일을 적어 닫으면 다음 회차를 더할 수 있습니다.
        </p>
      )}
      <DataTable
        headers={["Run", "Period", "Status", "Account", "Label"]}
        empty={playthroughs.length === 0 ? "등록된 회차 기록이 없습니다" : undefined}
      >
        {playthroughs.map((run) => (
          <tr
            key={run.playthroughId}
            onClick={() => onOpen({ kind: "playthrough", run })}
            className="cursor-pointer transition-colors hover:bg-white/[0.05]"
          >
            <td className="num px-4 py-3 whitespace-nowrap text-white/90">
              {run.sequenceNo}회차
            </td>
            {/* 회차에서 제일 먼저 읽는 값이라 다른 칸보다 진하게. 줄바꿈을 막는다 */}
            <td className="num w-[38%] px-4 py-3 font-medium whitespace-nowrap text-white/95">
              {run.startedOn} ~ {run.finishedOn ?? ""}
            </td>
            <td
              className={`px-4 py-3 whitespace-nowrap ${PLAYTHROUGH_TONE[run.status] ?? "text-white/60"}`}
            >
              {PLAYTHROUGH_STATUS_LABEL[run.status]}
            </td>
            <td className="px-4 py-3 text-white/60">{accountOf(run)}</td>
            <td className="px-4 py-3 whitespace-nowrap text-white/50">
              {run.label ?? "—"}
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}

/**
 * 계정 + 기기.
 *
 * 예전엔 칸을 둘로 나눴는데 노트북 폭에서 기간이 두 줄로 쪼개졌다. 한 칸에 합치면
 * **`Beene (한성컴퓨터 PC)`**로 같은 정보가 더 짧게 들어간다 — 계정만 있고 기기가 없으면
 * 괄호를 아예 안 붙인다
 */
function accountOf(run: {
  platformAccount?: { label: string } | null;
  device?: { name: string } | null;
  emulator?: { name: string } | null;
}) {
  const account = run.platformAccount?.label;
  const machine = run.emulator?.name ?? run.device?.name;
  if (account && machine) return `${account} (${machine})`;
  return account ?? machine ?? "—";
}
