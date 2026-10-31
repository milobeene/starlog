"use client";

import { useEffect, useRef } from "react";

/**
 * 스크린샷 격자 단축키 — S 선택 모드 토글 · A 전체 선택 · Esc 해제 · Delete/Backspace 삭제.
 *
 * ⚠️ `e.key`가 아니라 **`e.code`** 다 — 한글 입력기가 켜져 있으면 S를 눌러도 key는 "ㄴ"이다.
 * 글 쓰는 중(입력칸)·팝업이 떠 있을 때·⌘/Ctrl/Alt 조합은 건드리지 않는다 (⌘A·⌘S는 브라우저 몫).
 * 핸들러는 ref로 들고 있어 선택이 바뀔 때마다 리스너를 다시 달지 않는다
 */
export interface ShotShortcutHandlers {
  enabled: boolean;
  selectMode: boolean;
  selectedCount: number;
  itemCount: number;
  onToggleMode: () => void;
  onSelectAll: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function useShotShortcuts(h: ShotShortcutHandlers) {
  const ref = useRef(h);
  useEffect(() => { ref.current = h; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = ref.current;
      if (!s.enabled || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      switch (e.code) {
        case "KeyS":
          if (e.repeat) return;
          if (s.selectMode) s.onCancel();
          else if (s.itemCount > 0) s.onToggleMode();
          else return;
          break;
        case "KeyA":
          if (e.repeat || s.itemCount === 0) return;
          s.onSelectAll();
          break;
        case "Escape":
          if (!s.selectMode) return;
          s.onCancel();
          break;
        case "Delete":
        case "Backspace":
          if (!s.selectMode || s.selectedCount === 0 || !s.onDelete) return;
          s.onDelete();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
