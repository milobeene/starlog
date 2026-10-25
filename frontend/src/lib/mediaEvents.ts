"use client";

import { getBridge } from "@/lib/desktop";
import { closeTask, putTask } from "@/lib/tasks";

/**
 * 일렉트론 메인의 스크린샷 배경 일 (`desktop/mediaWork.js`)을 화면에 잇는다.
 *
 * - 배경 썸네일 진행 → 알림 하나 (`썸네일 준비 중 n/total`)
 * - 폴더가 바뀜(탐색기로 넣고 지움) → 지금 열린 스크린샷 목록에 "다시 읽어라"
 *
 * 다리 구독은 **문서에 하나**다 — 화면 컴포넌트마다 붙이면 같은 알림이 여럿 뜬다. 앱 껍데기가 한 번 부른다
 */

const TASK_ID = "media-thumbs";
const listeners = new Set<() => void>();
let attached = false;

/** 열린 스크린샷 목록이 구독한다. 반환값은 구독 해제 */
export function onMediaChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function attachMediaEvents(): void {
  if (attached) return;
  const media = getBridge()?.media;
  if (!media?.onProgress || !media.onChanged) return;
  attached = true;
  media.onProgress((p) => {
    if (p.phase === "run") {
      putTask({
        id: TASK_ID,
        kind: "media-thumbs",
        title: "썸네일 준비 중",
        progress: { done: p.done, total: p.total, label: `${p.done} / ${p.total}` },
        onAbort: () => void media.cancelPrepare?.(),
      });
    } else if (p.phase === "done") {
      putTask({ id: TASK_ID, kind: "media-thumbs", title: "썸네일 준비 끝", result: { ok: true, message: `${p.total}장` } });
    } else {
      closeTask(TASK_ID);
    }
  });
  let timer: ReturnType<typeof setTimeout> | null = null;
  media.onChanged(() => {
    // 감시가 한 번에 여러 폴더를 알리면 목록을 한 번만 다시 읽는다
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      listeners.forEach((fn) => fn());
    }, 150);
  });
}

/** 속도 기록 (윈도우 실기 측정용). 꺼져 있으면 아무것도 안 한다 — 켜졌는지는 처음 한 번만 묻는다 */
let timingOn: boolean | null = null;
export function mediaTiming(event: string, data: Record<string, number | string | boolean> = {}): void {
  const media = getBridge()?.media;
  if (timingOn === null) timingOn = Boolean(media?.timingOn?.());
  if (timingOn) media?.timing?.(event, data);
}
