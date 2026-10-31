"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getBridge, type IngestJob, type IngestPhase } from "./desktop";

export type { IngestJob, IngestPhase };
import { bytesParts } from "./format";
import { putTask } from "./tasks";

/**
 * 스크린샷 넣기(ingest) 상태 → 전역 스토어 + 알림 (2.1.0).
 *
 * ## 왜 화면 상태가 아닌가
 *
 * 수 GB 복사는 수 분 걸리고, 그동안 상세 화면을 떠났다 올 수 있다. 상태가 컴포넌트에 있으면 돌아왔을 때
 * 버튼이 다시 켜져 같은 폴더에 두 번째 일을 시킨다. 진실은 메인(`ingestStatus`)에 있고, 여기는 그 거울이다.
 *
 * 타입은 desktop.ts(다른 담당)와 계약서(contract.md)를 그대로 옮겼다 — 모양이 바뀌면 이 파일만 맞춘다.
 */
/** 계약서의 다리 모양 — desktop.ts에서는 옛 preload를 위해 전부 선택 칸이다 */
export type IngestBridge = {
  pathOf(file: File): string | null;
  ingest(req: { entryId: number; sources: string[]; takenAt?: Record<string, number> }): Promise<{ batchId: string }>;
  onIngest(cb: (job: IngestJob) => void): () => void;
  ingestStatus(): Promise<IngestJob[]>;
  driveInfo(): Promise<{ root: string; label: string | null; freeBytes: number; totalBytes: number }>;
  setDriveLabel(label: string | null): Promise<void>;
};

/** 옛 preload에는 없다 → 부르는 쪽은 null이면 HTTP 길로 간다 */
export function getIngestBridge(): IngestBridge | null {
  const media = getBridge()?.media;
  return media?.ingest && media.pathOf && media.onIngest && media.ingestStatus ? (media as unknown as IngestBridge) : null;
}

export const isIngestRunning = (job: IngestJob) =>
  job.phase === "copying" || job.phase === "verifying" || job.phase === "committing";

/* ---------- 스토어 ---------- */

let jobs: IngestJob[] = [];
const listeners = new Set<() => void>();
const EMPTY: IngestJob[] = [];

function publish(next: IngestJob[]) {
  jobs = next;
  listeners.forEach((l) => l());
}

function useJobs(): IngestJob[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => jobs,
    () => EMPTY,
  );
}

/** 이 게임에 도는 일이 있나 — 있으면 추가 버튼을 잠그고 진행을 보인다 */
export function useEntryIngest(entryId: number): IngestJob | null {
  return useJobs().find((j) => j.entryId === entryId && isIngestRunning(j)) ?? null;
}

/* ---------- 알림 ---------- */

/** 문서를 새로 받아도 같은 끝난 일을 또 띄우지 않게 — cloudBackup과 같은 이유 */
const SEEN_KEY = "starlog.ingestSeen";
function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
function markSeen(id: string) {
  try {
    const set = readSeen();
    set.add(id);
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-50)));
  } catch {
    /* 못 적으면 한 번 더 뜰 뿐이다 */
  }
}

const taskId = (job: IngestJob) => `ingest-${job.batchId}`;
const fmt = (n: number) => {
  const { value, unit } = bytesParts(n);
  return `${value}${unit}`;
};
const baseName = (p: string) => p.split(/[\\/]/).pop() || p;
/** 토스트가 길어지지 않게 — 나머지는 개수로만 */
const MAX_FAIL_LINES = 6;

function failureLines(job: IngestJob) {
  const used = new Map<string, number>();
  return job.failures.slice(0, MAX_FAIL_LINES).map((f) => {
    const name = baseName(f.source);
    // 라인 키가 label이라 같은 이름이 겹치면 구분한다 (다른 폴더의 같은 파일명)
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    return { ok: false, label: n > 1 ? `${name} (${n})` : name, detail: f.reason };
  });
}

export function applyIngestJob(job: IngestJob) {
  setJob(job);
  const id = taskId(job);
  if (isIngestRunning(job)) {
    putTask({
      id,
      kind: "screenshot-ingest",
      title: `스크린샷 넣는 중 ${job.done}/${job.total} (${fmt(job.bytesDone)}/${fmt(job.bytesTotal)})`,
      progress: { done: job.done, total: job.total, label: PHASE_LABEL[job.phase] },
    });
    return;
  }
  if (readSeen().has(job.batchId)) return;
  markSeen(job.batchId);
  if (job.phase === "done") {
    putTask({
      id,
      kind: "screenshot-ingest",
      title: `${job.committed.length || job.total}장 넣음`,
      result: { ok: true },
    });
    return;
  }
  const extra = job.failures.length - MAX_FAIL_LINES;
  const notes = [
    job.message,
    job.failures.length > 0 ? `실패 ${job.failures.length}개` : null,
    extra > 0 ? `외 ${extra}개는 생략` : null,
  ].filter(Boolean);
  putTask({
    id,
    kind: "screenshot-ingest",
    // 롤백이면 폴더는 그대로다 — 그걸 먼저 말해야 불안하지 않다
    title: "넣지 못했습니다 — 되돌렸습니다",
    result: { ok: false, lines: failureLines(job), message: notes.join(" · ") || undefined },
  });
}

const PHASE_LABEL: Record<IngestPhase, string> = {
  copying: "복사 중",
  verifying: "확인 중",
  committing: "정리 중",
  done: "",
  failed: "",
  rolledBack: "",
};

function setJob(job: IngestJob) {
  publish([...jobs.filter((j) => j.batchId !== job.batchId), job]);
}

/** 앱 껍데기에 한 번 붙인다 — 화면을 옮겨도 살아 있어야 진행과 결과를 놓치지 않는다 */
export function useIngestToasts() {
  useEffect(() => {
    const bridge = getIngestBridge();
    if (!bridge) return;
    let alive = true;
    const off = bridge.onIngest(applyIngestJob);
    bridge
      .ingestStatus()
      .then((all) => {
        if (!alive) return;
        // 이벤트가 먼저 와서 더 새 상태가 있을 수 있다 — 이미 아는 일은 덮지 않는다
        for (const job of all) if (!jobs.some((j) => j.batchId === job.batchId)) applyIngestJob(job);
      })
      .catch(() => {});
    return () => {
      alive = false;
      off();
    };
  }, []);
}

