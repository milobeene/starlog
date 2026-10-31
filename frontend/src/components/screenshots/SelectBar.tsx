"use client";

import ShareMenu from "@/components/media/ShareMenu";
import { ToolButton, ToolGroup } from "@/components/ui/ToolButton";

/**
 * 선택 도구 줄 조각 — 스크린샷 화면 둘과 상세 구역이 같이 쓴다.
 * **[선택]/[선택 취소]는 줄의 맨 오른쪽, 같은 자리다** — 취소하려고 다시 눌러야 하는데 버튼이 옮겨 가면 헛누름이 난다.
 * 그래서 선택 중에만 늘어나는 것(전체 선택·공유·삭제)은 그 왼쪽에 붙고, 이 버튼은 폭도 고정한다
 */
export function SelectToggle({ selectMode, disabled, onClick }: { selectMode: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <ToolGroup label="선택 모드">
      <ToolButton icon="select" kbd="S" active={selectMode} disabled={disabled} onClick={onClick} data-select-toggle className="min-w-[5.25rem] justify-center">
        {selectMode ? "선택 취소" : "선택"}
      </ToolButton>
    </ToolGroup>
  );
}

/** "n개 선택" — 머리 왼쪽, 제목 옆 */
export function SelectionCount({ count }: { count: number }) {
  return <span className="num shrink-0 text-xs text-white/60" data-selection-count>{count}개 선택</span>;
}

/** 선택 중에만 보이는 묶음 — 전체 선택 · (공유) · (삭제) */
export function SelectActions({
  allSelected,
  onToggleAll,
  shareTargets,
  deleteCount,
  deleteDisabled,
  onDelete,
}: {
  allSelected: boolean;
  onToggleAll: () => void;
  shareTargets?: { entryId: number; fileName: string }[];
  deleteCount?: number;
  deleteDisabled?: boolean;
  onDelete?: () => void;
}) {
  return (
    <ToolGroup label="선택 도구">
      <ToolButton icon="all" kbd="A" short onClick={onToggleAll}>{allSelected ? "전체 해제" : "전체 선택"}</ToolButton>
      {shareTargets && <ShareMenu targets={shareTargets} />}
      {onDelete && (
        <ToolButton icon="trash" tone="danger" disabled={!deleteCount || deleteDisabled} onClick={onDelete}>
          <span className="max-sm:sr-only">삭제</span>{deleteCount ? <span className="num"> ({deleteCount})</span> : ""}
        </ToolButton>
      )}
    </ToolGroup>
  );
}
