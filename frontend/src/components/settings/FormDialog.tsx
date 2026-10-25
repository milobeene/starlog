"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Field";
import { errorMessage } from "@/lib/api";

/** 설정의 폼 다이얼로그가 전부 같은 모양이라 저장·에러 처리를 여기 모았다 */
export default function FormDialog({
  title,
  onClose,
  onSubmit,
  tall = false,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  /** 메모 입력칸이 있는 폼 — 높이를 고정하고 `flex-1` 칸이 남는 높이를 먹는다 (`Modal tall`) */
  tall?: boolean;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={title}
      onClose={onClose}
      tall={tall}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit();
                onClose();
              } catch (caught) {
                setError(errorMessage(caught, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요."));
                setBusy(false);
              }
            }}
          >
            {busy ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      {/* tall이면 본문(세로 flex)의 남는 높이를 이 줄이 받아 자식 `flex-1`에게 넘긴다. min-h-0을 안 줘서 칸이 모자라면 본문이 자연스럽게 스크롤된다 */}
      <div className={`flex flex-col gap-4 ${tall ? "flex-1" : ""}`}>{children}</div>
    </Modal>
  );
}

/** 이름을 바꾸면 FK를 타고 과거 기록까지 전부 따라 바뀐다. 그걸 미리 알려준다 */
export function BulkChangeNotice() {
  return (
    <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
      이름을 바꾸시면 이 항목을 사용한 <b className="text-white/75">모든 기록에 함께 반영</b>됩니다.
    </p>
  );
}
