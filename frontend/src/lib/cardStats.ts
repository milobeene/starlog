"use client";

import { useSyncExternalStore } from "react";

/**
 * 카드에서 여는 점수·플레이타임 팝업의 대상 (카드 우클릭 메뉴·완료 토스트).
 *
 * 모듈 스토어인 이유 — 상태를 카드가 쥐면 저장 전에 카드가 사라진다. [완료]는 목록을 무효화하고,
 * 필터에 안 맞게 된 카드는 언마운트되기 때문이다. 토스트 버튼은 애초에 카드 밖에서 누른다.
 * 팝업 자체는 `(app)` 껍데기의 `CardStatsHost`가 그린다
 */
let target: number | null = null;
const listeners = new Set<() => void>();

export function openCardStats(entryId: number) {
  target = entryId;
  listeners.forEach((l) => l());
}

export function closeCardStats() {
  target = null;
  listeners.forEach((l) => l());
}

export function useCardStatsTarget(): number | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => target,
    () => null,
  );
}
