"use client";

import { useState } from "react";
import type { Playthrough } from "@/lib/types";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import SectionHeader from "@/components/common/SectionHeader";
import StatusBadge from "@/components/common/StatusBadge";
import PlaythroughDialog from "./PlaythroughDialog";
import { INPUT_METHOD_LABEL, formatPeriod } from "@/lib/labels";
import styles from "./DetailView.module.css";

type Props = {
  playthroughs: Playthrough[];
};

/** 회차 번호에는 구멍이 있을 수 있다 (1, 2, 4). 재부여하지 않는다 */
export default function PlaythroughSection({ playthroughs }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<Playthrough | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function openCreate() {
    setTarget(null);
    setDialogOpen(true);
  }

  function openEdit(playthrough: Playthrough) {
    setTarget(playthrough);
    setDialogOpen(true);
  }

  return (
    <section className={styles.section}>
      <SectionHeader
        title="플레이 회차"
        action={
          <Button size="sm" onClick={openCreate}>
            ＋ 회차 추가
          </Button>
        }
      />

      {playthroughs.length === 0 ? (
        <EmptyState
          message="아직 플레이 기록이 없습니다"
          action={
            <Button size="sm" onClick={openCreate}>
              ＋ 회차 추가
            </Button>
          }
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">회차</th>
                <th scope="col">기간</th>
                <th scope="col">상태</th>
                <th scope="col">기기</th>
                <th scope="col">입력</th>
                <th scope="col">계정</th>
                <th scope="col">라벨</th>
                <th scope="col" className={styles.right}>
                  관리
                </th>
              </tr>
            </thead>
            <tbody>
              {playthroughs.map((playthrough) => (
                <tr key={playthrough.playthroughId}>
                  <td>{playthrough.sequenceNo}</td>
                  <td>{formatPeriod(playthrough.startedOn, playthrough.finishedOn)}</td>
                  <td>
                    <StatusBadge status={playthrough.status} size="sm" />
                  </td>
                  <td>
                    {playthrough.device?.name ?? "—"}
                    {playthrough.emulator && (
                      <span className={styles.muted}> ({playthrough.emulator.name})</span>
                    )}
                  </td>
                  <td>
                    {playthrough.inputMethod
                      ? INPUT_METHOD_LABEL[playthrough.inputMethod]
                      : "—"}
                  </td>
                  <td>
                    {playthrough.platformAccount
                      ? `${playthrough.platformAccount.platform.name} · ${playthrough.platformAccount.label}`
                      : "—"}
                  </td>
                  <td>{playthrough.label ?? "—"}</td>
                  <td className={styles.right}>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(playthrough)}>
                      수정
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PlaythroughDialog
        open={dialogOpen}
        target={target}
        onClose={() => setDialogOpen(false)}
        onDelete={() => {
          setDialogOpen(false);
          setConfirmOpen(true);
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="회차를 삭제할까요?"
        description={`${target?.sequenceNo ?? ""}회차 기록이 사라집니다. 삭제하면 항목 상태가 다시 계산됩니다.`}
        onClose={() => setConfirmOpen(false)}
      />
    </section>
  );
}
