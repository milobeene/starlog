"use client";

import { useState } from "react";
import type { MemberDevice } from "@/lib/types";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import Dialog from "@/components/common/Dialog";
import SettingsSection from "./SettingsSection";
import { MOCK_OPTIONS } from "@/lib/mock";
import form from "@/components/common/form.module.css";
import styles from "./Settings.module.css";

type Props = {
  devices: MemberDevice[];
};

/** 기기는 마스터 전체에서 고른다 — 보유 목록은 우선 표시일 뿐 제약이 아니다 (BR-PT-05) */
export default function DeviceTable({ devices }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<MemberDevice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemberDevice | null>(null);

  return (
    <SettingsSection
      title="보유 기기"
      action={
        <Button
          size="sm"
          onClick={() => {
            setTarget(null);
            setDialogOpen(true);
          }}
        >
          ＋ 추가
        </Button>
      }
    >
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">기기</th>
              <th scope="col">라벨</th>
              <th scope="col">메모</th>
              <th scope="col" className={styles.right}>
                관리
              </th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.memberDeviceId}>
                <td>{device.device.name}</td>
                <td>{device.label}</td>
                <td className={device.memo ? undefined : styles.muted}>
                  {device.memo ?? "—"}
                </td>
                <td className={styles.right}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTarget(device);
                      setDialogOpen(true);
                    }}
                  >
                    수정
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(device)}>
                    삭제
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogOpen}
        title={target ? "보유 기기 수정" : "보유 기기 추가"}
        onClose={() => setDialogOpen(false)}
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)}>취소</Button>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              저장
            </Button>
          </>
        }
      >
        <div className={form.stack}>
          <label className={form.field}>
            <span className={form.label}>기기</span>
            <select className={form.select} defaultValue={target?.device.id ?? ""}>
              {MOCK_OPTIONS.devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>

          <label className={form.field}>
            <span className={form.label}>라벨</span>
            <input className={form.input} defaultValue={target?.label ?? ""} />
          </label>

          <label className={form.field}>
            <span className={form.label}>메모</span>
            <textarea className={form.textarea} defaultValue={target?.memo ?? ""} />
          </label>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="기기를 삭제할까요?"
        description={`"${deleteTarget?.label ?? ""}" — 보유 기기 목록에서만 사라집니다. 회차에 남은 기기 기록은 그대로입니다.`}
        onClose={() => setDeleteTarget(null)}
      />
    </SettingsSection>
  );
}
