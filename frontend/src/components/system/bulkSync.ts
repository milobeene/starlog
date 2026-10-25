import type { MutableRefObject } from "react";
import { api } from "@/lib/api";
import { isTaskRunning, putTask, updateTask } from "@/lib/tasks";
import type { GameMaster } from "@/lib/types";

/** 발사 간격. IGDB 한도(초당 4회 = 250ms)보다 느슨하게 잡았다 — 여유 50ms */
export const SYNC_INTERVAL_MS = 300;
/** 마지막 건이 쏜 뒤 응답을 받아 반영하기까지 */
const SYNC_TAIL_MS = 2000;

/** 예상 소요 초. 발사 간격이 고정이라 건수에 비례한다 — 응답 속도는 꼬리 한 번만 더한다 */
export function estimateSyncSeconds(count: number): number {
  return count === 0 ? 0 : Math.ceil(((count - 1) * SYNC_INTERVAL_MS + SYNC_TAIL_MS) / 1000);
}

/** 65 → "약 1분 5초", 12 → "약 12초" */
export function formatSyncEstimate(seconds: number): string {
  if (seconds < 60) return `약 ${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `약 ${minutes}분` : `약 ${minutes}분 ${rest}초`;
}

/**
 * 일괄 동기화를 돌린다. 진행·결과는 알림(`tasks`)으로 낸다.
 * `abort`는 알림의 [중단]이 켜는 신호다 — 다이얼로그가 닫혀도 알림이 살아 있어서 ref로 넘겨 받는다
 */
export async function runBulkSync(targets: GameMaster[], abort: MutableRefObject<boolean>) {
  /*
   * 겹쳐 돌면 안 된다 — 두 번째가 `abort`를 false로 되돌려 첫 번째의 [중단]이 안 먹고,
   * 두 타이머 줄이 같이 돌아 초당 4회 한도를 넘는다. 버튼도 막지만 마지막 방어선은 여기다
   */
  if (targets.length === 0 || isTaskRunning("bulk-sync")) return;
  /*
   * **알림으로 옮겼다** (2026-08-28). 예전엔 여기 상태에 진행을 담았는데,
   * 다른 탭으로 옮기면 이 컴포넌트가 언마운트되어 **UI만 사라지고 동기화는 계속** 돌았다.
   * 사용자는 멈춘 줄 알고 또 누른다. 알림은 껍데기에 붙어 있어 화면을 넘어 산다
   */
  abort.current = false;
  const controller = new AbortController();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let finish: () => void = () => {};
  const allSettled = new Promise<void>((resolve) => {
    finish = resolve;
  });

  /*
   * ⚠️ **중단은 세 가지를 같이 한다** (2026-10-25). 예전엔 플래그만 켜서 "아직 안 쏜 타이머"만 막았는데,
   * 발사는 0.3초 간격이라 145건이면 43초에 **전부 이미 나간 뒤**다. 진행 표시는 *응답* 기준이라
   * 12/145에서 눌러도 요청은 다 나가 있었고, 막을 게 없어 끝까지 돌아 "145개 중 145개 갱신"이 떴다.
   *   1) 대기 중인 타이머를 걷어낸다
   *   2) 나간 요청은 fetch를 abort한다 — 브라우저 큐에서 기다리던 것은 아예 서버에 안 간다
   *   3) 그 뒤 늦게 오는 결과는 세지 않는다
   */
  const stop = () => {
    if (abort.current) return;
    abort.current = true;
    timers.forEach(clearTimeout);
    controller.abort();
    finish();
  };

  const put = (done: number, label: string) =>
    putTask({
      id: "bulk-sync",
      kind: "bulk-sync",
      title: "게임 마스터 일괄 동기화",
      progress: { done, total: targets.length, label },
      onAbort: stop,
    });

  put(0, targets[0].name);
  let synced = 0;
  let done = 0;

  /*
   * ⚠️ **응답을 기다리지 않고 0.3초마다 쏜다** (2026-08-29).
   *
   * 예전엔 한 건이 끝나길 기다렸다가 0.3초를 더 쉬었다. IGDB 응답이 1초면
   * 한 건에 1.3초라 100개에 2분이 넘었다. 지금은 전체 시간이 **건수 × 0.3초**로
   * 고정된다 — 응답 속도와 무관해진다.
   *
   * **동시 실행 수를 제한하는 방식은 안 쓴다.** IGDB 한도는 "동시 4개"가 아니라
   * **초당 4회**다. 동시 4개로 돌리면 응답이 빠를 때 초당 수십 번이 나간다 —
   * 동시 실행 수는 발사 속도를 전혀 안 막는다. 간격을 재는 쪽이 한도와 같은 단위다
   */
  targets.forEach((game, i) => {
    timers.push(
      setTimeout(async () => {
        try {
          await api.post(`/api/games/${game.gameId}/resync`, undefined, controller.signal);
          if (abort.current) return;
          synced += 1;
        } catch {
          // 한 건이 실패해도 나머지는 돈다 — 다시 누르면 그것만 다시 잡힌다. 중단으로 끊긴 건도 여기로 온다
          if (abort.current) return;
        }
        done += 1;
        put(done, game.name);
        if (done === targets.length) finish();
      }, i * SYNC_INTERVAL_MS),
    );
  });
  await allSettled;

  const aborted = abort.current;
  updateTask("bulk-sync", {
    title: aborted ? "일괄 동기화 중단됨" : "일괄 동기화 완료",
    progress: undefined,
    onAbort: undefined,
    result: {
      ok: !aborted,
      message: aborted
        ? `${targets.length}개 중 ${synced}개를 갱신하고 중단했습니다. 이미 서버에 닿은 몇 건은 마저 끝났을 수 있습니다. 다시 누르시면 남은 것만 다시 잡힙니다.`
        : `${targets.length}개 중 ${synced}개를 갱신했습니다.`,
    },
  });
}
