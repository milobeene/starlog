"use client";

import { useState } from "react";
import type { Acquisition } from "@/lib/types";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import SectionHeader from "@/components/common/SectionHeader";
import AcquisitionDialog from "./AcquisitionDialog";
import { ACQUISITION_METHOD_LABEL, formatDate, formatMoney } from "@/lib/labels";
import styles from "./DetailView.module.css";

type Props = {
  acquisitions: Acquisition[];
};

/** 재구매·DLC로 여러 건이 쌓일 수 있다 (FR-ACQ-06) */
export default function AcquisitionSection({ acquisitions }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<Acquisition | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function openCreate() {
    setTarget(null);
    setDialogOpen(true);
  }

  return (
    <section className={styles.section}>
      <SectionHeader
        title="취득 기록"
        action={
          <Button size="sm" onClick={openCreate}>
            ＋ 취득 추가
          </Button>
        }
      />

      {acquisitions.length === 0 ? (
        <EmptyState
          message="취득 기록이 없습니다"
          action={
            <Button size="sm" onClick={openCreate}>
              ＋ 취득 추가
            </Button>
          }
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">방식</th>
                <th scope="col">플랫폼</th>
                <th scope="col">계정</th>
                <th scope="col">구독</th>
                <th scope="col">금액</th>
                <th scope="col">취득일</th>
                <th scope="col">라벨</th>
                <th scope="col" className={styles.right}>
                  관리
                </th>
              </tr>
            </thead>
            <tbody>
              {acquisitions.map((acquisition) => (
                <tr key={acquisition.acquisitionId}>
                  <td>{ACQUISITION_METHOD_LABEL[acquisition.method]}</td>
                  <td>{acquisition.platform?.name ?? "—"}</td>
                  <td>{acquisition.platformAccount?.label ?? "—"}</td>
                  <td>{acquisition.subscription?.serviceName ?? "—"}</td>
                  <td>{formatMoney(acquisition.price)}</td>
                  <td>{formatDate(acquisition.acquiredOn)}</td>
                  <td>{acquisition.label ?? "—"}</td>
                  <td className={styles.right}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setTarget(acquisition);
                        setDialogOpen(true);
                      }}
                    >
                      수정
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AcquisitionDialog
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
        title="취득 기록을 삭제할까요?"
        description="삭제하면 항목 상태가 다시 계산됩니다."
        onClose={() => setConfirmOpen(false)}
      />
    </section>
  );
}
