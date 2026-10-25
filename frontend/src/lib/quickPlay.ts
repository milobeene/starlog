import { api, errorMessage } from "@/lib/api";
import { invalidateQueries } from "@/lib/useApi";
import { putTask } from "@/lib/tasks";
import { todayKst } from "@/lib/format";
import type { BacklogDetail, EntryStatus, Playthrough, PlaythroughStatus } from "@/lib/types";

/**
 * 플레이 시작·완료·중단을 한 번에 (v2 U2).
 *
 * **버튼은 언제나 오늘 날짜다.** 다른 날짜는 상세의 회차 팝업에서 손으로 고친다 —
 * 날짜까지 묻기 시작하면 팝업이 다시 생긴다.
 * 서버 API는 그대로 쓴다: 상태는 회차에서 파생되므로(`deriveState`) 회차를 만들고 고치는 것이 전부다
 */
export type QuickAction = "start" | "complete" | "pause" | "resume" | "drop" | "purchase";

export const QUICK_ACTION_LABEL: Record<QuickAction, string> = {
  start: "플레이 시작",
  complete: "완료",
  pause: "일시정지",
  resume: "다시 시작",
  drop: "중단",
  purchase: "샀어요",
};

/**
 * 상태별로 보여줄 동작. 헤더와 카드 우클릭 메뉴가 같은 표를 쓴다.
 *
 * 위시리스트도 [플레이 시작]을 둔다 — 무료 게임처럼 취득 기록 없이 바로 하는 경우가 있고,
 * 서버도 막지 않는다
 */
export function actionsFor(status: EntryStatus): QuickAction[] {
  switch (status) {
    case "WISHLIST":
      return ["purchase", "start"];
    case "PLAYING":
      return ["complete", "pause", "drop"];
    case "PAUSED":
      return ["resume", "complete", "drop"];
    default:
      // BACKLOG · COMPLETED · DROPPED — 활성 회차가 없다
      return ["start"];
  }
}

/**
 * 서버의 최신 회차 규칙과 같다 (`backlog/shared.ts` newer) — COALESCE(종료일, 시작일) 최대,
 * 같으면 진행 중 → 늦게 시작 → 번호가 큰 쪽. 같은 날 끝내고 바로 시작한 회차가 이겨야 한다
 */
function newer(p: Playthrough, q: Playthrough): boolean {
  const a = p.finishedOn ?? p.startedOn;
  const b = q.finishedOn ?? q.startedOn;
  if (a !== b) return a > b;
  if ((p.finishedOn === null) !== (q.finishedOn === null)) return p.finishedOn === null;
  if (p.startedOn !== q.startedOn) return p.startedOn > q.startedOn;
  return p.sequenceNo > q.sequenceNo;
}

export function latestRun(runs: Playthrough[]): Playthrough | null {
  let latest: Playthrough | null = null;
  for (const run of runs) {
    if (latest === null || newer(run, latest)) latest = run;
  }
  return latest;
}

/** PUT은 통째로 받는다(빠진 칸은 지움). 안 건드리는 칸을 그대로 실어야 한다 */
function bodyOf(
  run: Playthrough,
  patch: { status: PlaythroughStatus; finishedOn: string | null },
) {
  return {
    startedOn: run.startedOn,
    finishedOn: patch.finishedOn,
    status: patch.status,
    deviceId: run.device?.deviceId ?? null,
    platformId: run.platform?.platformId ?? null,
    emulatorId: run.emulator?.emulatorId ?? null,
    platformAccountId: run.platformAccount?.accountId ?? null,
    inputMethodId: run.inputMethod?.inputMethodId ?? null,
    label: run.label,
  };
}

/**
 * 종료일 규칙(서버 `apply`): PLAYING은 종료일 금지, COMPLETED·DROPPED는 필수.
 * PAUSED는 둘 다 허용인데 **비워 둔다** — 이어 할 회차라서 "진행 중"(종료일 없음)으로 남겨야
 * 서버가 새 회차를 막아 준다. 날짜를 적고 싶으면 상세의 회차 팝업에서
 */
const TARGET: Record<Exclude<QuickAction, "start" | "purchase">, { status: PlaythroughStatus; ends: boolean }> = {
  complete: { status: "COMPLETED", ends: true },
  drop: { status: "DROPPED", ends: true },
  pause: { status: "PAUSED", ends: false },
  resume: { status: "PLAYING", ends: false },
};

const DONE_MESSAGE: Record<QuickAction, (date: string) => string> = {
  start: (d) => `플레이를 시작했어 · ${d}`,
  complete: (d) => `완료로 기록했어 · ${d}`,
  pause: () => "일시정지했어",
  resume: () => "다시 시작했어",
  drop: (d) => `중단으로 기록했어 · ${d}`,
  purchase: (d) => `구매로 기록했어 · ${d}`,
};

/** 서버를 부른다. 실패는 서버 메시지 그대로 던진다 (겹침·날짜 순서 같은 규칙은 서버가 판정) */
async function execute(entryId: number, action: QuickAction, today: string) {
  if (action === "purchase") {
    // 필수는 방식뿐이다 — 가격·플랫폼은 비워 둬도 저장된다. 채우려면 상세의 취득 팝업에서
    await api.post(`/api/backlog/${entryId}/acquisitions`, {
      method: "PURCHASED",
      acquiredOn: today,
    });
    return;
  }

  // 항상 서버에서 새로 읽는다 — 카드는 상태만 알고 회차는 모른다
  const detail = await api.get<BacklogDetail>(`/api/backlog/${entryId}`);
  const latest = latestRun(detail.playthroughs);

  if (action === "start") {
    // 직전 회차의 기기·플랫폼(또는 에뮬)·계정·입력을 이어받는다. 라벨은 회차마다 달라서 뺀다
    await api.post(`/api/backlog/${entryId}/playthroughs`, {
      ...(latest ? bodyOf(latest, { status: "PLAYING", finishedOn: null }) : emptyRefs()),
      startedOn: today,
      finishedOn: null,
      status: "PLAYING",
      label: null,
    });
    return;
  }

  // 상태가 PLAYING/PAUSED면 최신 회차가 곧 그 회차다 (항목 상태 = 최신 회차의 상태)
  if (!latest || (latest.status !== "PLAYING" && latest.status !== "PAUSED")) {
    throw new Error("진행 중인 회차가 없어. 화면을 새로 고쳐 줘");
  }
  const target = TARGET[action];
  await api.put(
    `/api/playthroughs/${latest.playthroughId}`,
    bodyOf(latest, { status: target.status, finishedOn: target.ends ? today : null }),
  );
}

function emptyRefs() {
  return {
    deviceId: null,
    platformId: null,
    emulatorId: null,
    platformAccountId: null,
    inputMethodId: null,
  };
}

/**
 * 실행 + 전역 무효화 + 결과 토스트. 성공하면 true.
 * 실패는 서버 메시지를 토스트에 그대로 띄운다 — 조용히 실패하면 눌렀는지도 모른다
 */
export async function runQuickAction(
  entryId: number,
  action: QuickAction,
  extra?: { actions?: { label: string; run: () => void }[] },
): Promise<boolean> {
  const today = todayKst();
  try {
    await execute(entryId, action, today);
  } catch (caught) {
    putTask({
      id: "quick-play",
      kind: "quick-play",
      title: `${QUICK_ACTION_LABEL[action]} — 못 했어`,
      result: { ok: false, message: errorMessage(caught, "잠시 후 다시 시도해 줘") },
    });
    return false;
  }
  invalidateQueries();
  putTask({
    id: "quick-play",
    kind: "quick-play",
    title: DONE_MESSAGE[action](today),
    result: { ok: true },
    actions: extra?.actions,
  });
  return true;
}
