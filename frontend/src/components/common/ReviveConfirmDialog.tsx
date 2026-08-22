"use client";

import Button from "./Button";
import Dialog from "./Dialog";

type Props = {
  open: boolean;
  targetName: string;
  /** 게임 담기 / 플랫폼 계정 재등록 두 곳에서 쓴다 */
  kind: "backlog" | "platformAccount";
  onClose: () => void;
};

const COPY = {
  backlog: {
    title: "예전에 삭제한 게임입니다",
    verb: "되살리면 예전 회차·취득 기록이 그대로 돌아옵니다.",
  },
  platformAccount: {
    title: "예전에 삭제한 계정입니다",
    verb: "되살리면 그 계정을 참조하던 과거 기록이 그대로 이어집니다.",
  },
} as const;

export default function ReviveConfirmDialog({
  open,
  targetName,
  kind,
  onClose,
}: Props) {
  const copy = COPY[kind];

  return (
    <Dialog
      open={open}
      title={copy.title}
      description={`"${targetName}" — ${copy.verb}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={onClose}>
            되살리기
          </Button>
        </>
      }
    />
  );
}
