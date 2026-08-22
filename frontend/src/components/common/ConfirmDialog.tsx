"use client";

import Button from "./Button";
import Dialog from "./Dialog";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onClose: () => void;
};

/** 파괴적 작업 확인용. 태그 명시 삭제·항목 삭제 등에서 재사용한다 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "삭제",
  danger = true,
  onClose,
}: Props) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onClose}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
