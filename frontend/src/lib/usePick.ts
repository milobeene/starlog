"use client";

import { useCallback, useMemo, useState } from "react";
import { applyPick } from "@/lib/pick";

/**
 * 스크린샷 격자의 "선택 모드" 상태 — 전체 화면 갤러리와 상세의 스크린샷 구역이 같이 쓴다.
 *
 * 선택은 **현재 목록의 위치(0..count-1)**로 든다. 목록이 새로 오면 위치의 뜻이 달라지므로
 * `resetKey`가 바뀔 때(= 새 목록이 올 때) 선택을 비운다. 기준(anchor)은 ref가 아니라 state다 —
 * 렌더 중에 같이 비워야 해서다
 */
export function usePick(count: number, resetKey?: unknown) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [seenKey, setSeenKey] = useState(resetKey);

  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setSelected(new Set());
    setAnchor(null);
  }

  const order = useMemo(() => Array.from({ length: count }, (_, index) => index), [count]);
  const allSelected = count > 0 && selected.size === count;

  /** 모드는 두고 고른 것만 비운다 (삭제 뒤·새 목록) */
  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);

  const cancel = useCallback(() => {
    setSelectMode(false);
    clear();
  }, [clear]);

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(order));
    setAnchor(null);
  };

  const pick = (index: number, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    const shift = event.shiftKey;
    const toggle = event.metaKey || event.ctrlKey;
    if (shift && anchor !== null && selected.has(index)) {
      /*
       * 이미 켜진 칸을 Shift로 누르면 범위를 **끈다** (사용자 요구: 범위 일괄 선택/해제).
       * `applyPick`은 켜는 쪽만 알아서 이 한 갈래만 여기서 푼다
       */
      const from = order.indexOf(anchor);
      const range = order.slice(Math.min(from, index), Math.max(from, index) + 1);
      setSelected((prev) => {
        const next = new Set(prev);
        range.forEach((i) => next.delete(i));
        return next;
      });
      return;
    }
    /*
     * 체크박스 화면이라 일반 클릭도 "그 칸만 토글"이다(`row: false`). Shift는 기존 선택에
     * 범위를 더한다(`toggle: true`) — 파일 관리자처럼 교체하면 앞서 고른 것이 사라진다
     */
    const result = applyPick(selected, order, anchor, index, {
      shift,
      toggle: shift || toggle,
      row: false,
    });
    setAnchor(result.anchor);
    setSelected(result.next);
  };

  return { selectMode, setSelectMode, selected, order, allSelected, pick, toggleAll, clear, cancel };
}
