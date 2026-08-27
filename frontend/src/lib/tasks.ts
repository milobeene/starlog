"use client";

import { useSyncExternalStore } from "react";

/**
 * 오래 걸리는 일의 진행과 결과 (2026-08-28).
 *
 * ## 왜 전역 스토어인가
 *
 * 연결 테스트와 일괄 동기화는 **화면을 옮겨도 계속 돈다.** 그런데 상태가 컴포넌트 안에
 * 있으면 언마운트되는 순간 UI가 사라지고, 사용자는 **멈춘 줄 알고 또 누른다.**
 * 실제로 그렇게 됐다 — "50개 중 25개"에서 다른 탭에 갔다 오면 아무것도 안 보였다.
 *
 * `session.ts`와 같은 방식이다 — 모듈 스코프에 상태를 두고 구독자에게 방송한다.
 * 라우팅은 같은 문서 안에서 일어나므로 이 모듈은 살아남는다.
 *
 * ## 종류를 셋으로 못 박는다
 *
 * 아무 알림이나 여기로 보내면 곧 토스트가 화면을 덮는다. **오래 걸려서 결과를 놓칠 수 있는
 * 일**만 담는다 — 연결 테스트, 일괄 동기화, 단건 재동기화. 나머지는 그 자리에서 보여준다.
 */
export type TaskKind = "connection-test" | "bulk-sync" | "resync";

export type Task = {
  id: string;
  kind: TaskKind;
  title: string;
  /** 진행 중이면 있다. `total`이 0이면 진행률 바 없이 도는 표시만 */
  progress?: { done: number; total: number; label?: string };
  /** 끝났으면 있다 */
  result?: {
    ok: boolean;
    /** 부분별 결과. 연결 테스트가 DB·스토리지·IGDB를 따로 보고한다 */
    lines?: { ok: boolean; label: string; detail?: string }[];
    message?: string;
  };
  /** 중단할 수 있는 일이면 있다 */
  onAbort?: () => void;
  /**
   * 끝난 뒤 이어서 할 수 있는 것 (2026-08-28).
   *
   * 연결 테스트는 **결과를 본 다음이 진짜 목적**이다 — 통과했으면 저장해야 하고,
   * 고칠 게 있으면 그 화면으로 돌아가야 한다. 알림에서 바로 못 하면
   * "어디서 눌렀더라"를 되짚어 찾아가야 한다
   */
  actions?: { label: string; primary?: boolean; run: () => void }[];
};

let tasks: Task[] = [];
const listeners = new Set<() => void>();

function publish(next: Task[]) {
  tasks = next;
  listeners.forEach((l) => l());
}

/** 시작하거나 갱신한다. 같은 종류는 하나만 둔다 — 두 번 누르면 새것이 이긴다 */
export function putTask(task: Task) {
  publish([...tasks.filter((t) => t.id !== task.id), task]);
}

export function updateTask(id: string, patch: Partial<Task>) {
  publish(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

/**
 * 닫는다. **스스로 사라지지 않는다** (사용자 결정 2026-08-28) —
 * 자동으로 없어지면 다른 화면을 보는 사이에 결과를 놓친다
 */
export function closeTask(id: string) {
  publish(tasks.filter((t) => t.id !== id));
}

const SERVER_SNAPSHOT: Task[] = [];

export function useTasks(): Task[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => tasks,
    /* 정적 빌드는 Node에서 그린다 — 매번 새 배열을 주면 무한 렌더가 된다 */
    () => SERVER_SNAPSHOT,
  );
}
