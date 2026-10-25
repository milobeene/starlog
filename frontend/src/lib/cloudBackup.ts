"use client";

import { useEffect } from "react";
import { getBridge, type CloudBackupKind, type CloudBackupStatus } from "./desktop";
import { putTask } from "./tasks";

/**
 * 클라우드 백업 상태 → 알림 (2026-10-25).
 *
 * 자동 백업은 기동 직후 **뒤에서** 돈다. 그 순간 화면은 입구에서 본 앱으로 넘어가는 중이라(문서를 새로
 * 받기도 한다) 이벤트를 놓칠 수 있다 — 그래서 붙을 때 메인의 마지막 상태를 한 번 가져오고, 이후는 이벤트로 받는다.
 * 같은 상태를 두 번 띄우지 않게 `seq`를 기억한다. 문서를 새로 받아도 이어지게 sessionStorage에도 둔다
 */
export const CLOUD_BACKUP_TASK: Record<CloudBackupKind, string> = {
  auto: "cloud-backup-auto",
  manual: "cloud-backup-manual",
};

const SEEN_KEY = "starlog.cloudBackupSeen";
let seen: Record<CloudBackupKind, number> = readSeen();

function readSeen(): Record<CloudBackupKind, number> {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return { auto: Number(parsed?.auto) || 0, manual: Number(parsed?.manual) || 0 };
  } catch {
    return { auto: 0, manual: 0 };
  }
}

function markSeen(kind: CloudBackupKind, seq: number) {
  seen = { ...seen, [kind]: seq };
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* 못 적으면 새로 받은 문서에서 한 번 더 뜰 뿐이다 */
  }
}

export function applyCloudBackupStatus(status: CloudBackupStatus) {
  if (status.seq <= seen[status.kind]) return;
  markSeen(status.kind, status.seq);
  const id = CLOUD_BACKUP_TASK[status.kind];
  const auto = status.kind === "auto";
  if (status.phase === "skipped") return;
  if (status.phase === "running") {
    putTask({
      id,
      kind: "cloud-backup",
      title: auto ? "클라우드 자동 백업 중…" : "클라우드 백업 중…",
      progress: { done: 0, total: 0 },
    });
    return;
  }
  putTask({
    id,
    kind: "cloud-backup",
    title: auto ? "클라우드 자동 백업" : "클라우드 백업",
    result:
      status.phase === "done"
        ? {
            ok: true,
            message: auto
              ? `클라우드 백업 완료 — ${status.fileName} (자동 백업 ${status.autoCount}/${status.keepAuto})`
              : `클라우드 백업 완료 — ${status.fileName}`,
          }
        : { ok: false, message: `클라우드 백업 실패 — ${status.message ?? "알 수 없는 오류"}` },
  });
}

/** 앱 껍데기에 한 번 붙인다 — 화면을 옮겨도 살아 있어야 결과를 놓치지 않는다 */
export function useCloudBackupToasts() {
  useEffect(() => {
    const bridge = getBridge()?.cloudBackups;
    if (!bridge) return;
    let alive = true;
    const off = bridge.onStatus(applyCloudBackupStatus);
    bridge
      .status()
      .then((all) => {
        if (!alive) return;
        // 이벤트가 먼저 왔으면 seq가 이미 앞서 있어 걸러진다
        for (const s of [all.auto, all.manual]) if (s) applyCloudBackupStatus(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
      off();
    };
  }, []);
}
