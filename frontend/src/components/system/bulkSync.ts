import type { MutableRefObject } from "react";
import { api } from "@/lib/api";
import { putTask, updateTask } from "@/lib/tasks";
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
 * `abort`는 알림의 [중단]이 건드리는 신호다 — 루프가 매 건 확인한다
 */
export async function runBulkSync(targets: GameMaster[], abort: MutableRefObject<boolean>) {
  /*
   * **알림으로 옮겼다** (2026-08-28). 예전엔 여기 상태에 진행을 담았는데,
   * 다른 탭으로 옮기면 이 컴포넌트가 언마운트되어 **UI만 사라지고 동기화는 계속** 돌았다.
   * 사용자는 멈춘 줄 알고 또 누른다. 알림은 껍데기에 붙어 있어 화면을 넘어 산다
   */
  abort.current = false;
  const put = (done: number, label: string) =>
    putTask({
      id: "bulk-sync",
      kind: "bulk-sync",
      title: "게임 마스터 일괄 동기화",
      progress: { done, total: targets.length, label },
      onAbort: () => {
        abort.current = true;
      },
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
  const flights = targets.map(
    (game, i) =>
      new Promise<void>((resolve) => {
        setTimeout(async () => {
          if (abort.current) return resolve();
          try {
            await api.post(`/api/games/${game.gameId}/resync`);
            synced += 1;
          } catch {
            // 한 건이 실패해도 나머지는 돈다 — 다시 누르면 그것만 다시 잡힌다
          }
          done += 1;
          put(done, game.name);
          resolve();
        }, i * SYNC_INTERVAL_MS);
      }),
  );
  await Promise.all(flights);

  updateTask("bulk-sync", {
    title: abort.current ? "일괄 동기화 중단됨" : "일괄 동기화 완료",
    progress: undefined,
    onAbort: undefined,
    result: {
      ok: !abort.current,
      message: `${targets.length}개 중 ${synced}개를 갱신했습니다.`
        + (abort.current ? " 다시 누르시면 남은 것만 다시 잡힙니다." : ""),
    },
  });
}
