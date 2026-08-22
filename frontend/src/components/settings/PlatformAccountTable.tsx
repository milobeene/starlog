"use client";

import { useState } from "react";
import type { PlatformAccountRef } from "@/lib/types";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import Dialog from "@/components/common/Dialog";
import ReviveConfirmDialog from "@/components/common/ReviveConfirmDialog";
import SettingsSection from "./SettingsSection";
import { MOCK_DELETED_ACCOUNT_LABELS, MOCK_OPTIONS } from "@/lib/mock";
import form from "@/components/common/form.module.css";
import styles from "./Settings.module.css";

type Props = {
  accounts: PlatformAccountRef[];
};

/** 같은 플랫폼에 계정이 여러 개일 수 있다 (FR-PLT-02). 삭제는 소프트 — 과거 기록이 참조한다 */
export default function PlatformAccountTable({ accounts }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<PlatformAccountRef | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformAccountRef | null>(null);
  const [label, setLabel] = useState("");
  const [reviveTarget, setReviveTarget] = useState<string | null>(null);

  function openCreate() {
    setTarget(null);
    setLabel("");
    setDialogOpen(true);
  }

  function openEdit(account: PlatformAccountRef) {
    setTarget(account);
    setLabel(account.label);
    setDialogOpen(true);
  }

  function save() {
    setDialogOpen(false);
    // 삭제했던 계정과 같은 이름이면 새로 만들지 않고 되살릴지 먼저 묻는다
    if (!target && MOCK_DELETED_ACCOUNT_LABELS.includes(label.trim())) {
      setReviveTarget(label.trim());
    }
  }

  return (
    <SettingsSection
      title="플랫폼 계정"
      action={
        <Button size="sm" onClick={openCreate}>
          ＋ 추가
        </Button>
      }
    >
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">플랫폼</th>
              <th scope="col">라벨</th>
              <th scope="col" className={styles.right}>
                관리
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.accountId}>
                <td>{account.platform.name}</td>
                <td>{account.label}</td>
                <td className={styles.right}>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(account)}>
                    수정
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(account)}>
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
        title={target ? "플랫폼 계정 수정" : "플랫폼 계정 추가"}
        onClose={() => setDialogOpen(false)}
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)}>취소</Button>
            <Button variant="primary" onClick={save}>
              저장
            </Button>
          </>
        }
      >
        <div className={form.stack}>
          <label className={form.field}>
            <span className={form.label}>플랫폼</span>
            <select className={form.select} defaultValue={target?.platform.id ?? ""}>
              {MOCK_OPTIONS.platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>
          </label>

          <label className={form.field}>
            <span className={form.label}>라벨</span>
            <input
              className={form.input}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="본계정 · 부계정 등"
            />
            <span className={form.hint}>
              삭제했던 이름(예: 예전 부계정)을 다시 적으면 되살리기 확인이 뜹니다
            </span>
          </label>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="계정을 삭제할까요?"
        description={`"${deleteTarget?.label ?? ""}" — 과거 회차·취득 기록에는 계속 표시되고, 새로 고르는 선택지에서만 빠집니다.`}
        onClose={() => setDeleteTarget(null)}
      />

      <ReviveConfirmDialog
        open={reviveTarget !== null}
        targetName={reviveTarget ?? ""}
        kind="platformAccount"
        onClose={() => setReviveTarget(null)}
      />
    </SettingsSection>
  );
}
