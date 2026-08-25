"use client";

import { useState } from "react";
import Modal from "./Modal";
import { Button } from "./Field";

/** 되돌리기 어려운 동작 앞에 세운다 — 삭제·탈퇴 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "삭제",
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={title}
      width="max-w-md"
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
                setBusy(false);
              }
            }}
          >
            {busy ? "처리 중" : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-white/70">{message}</p>
    </Modal>
  );
}
