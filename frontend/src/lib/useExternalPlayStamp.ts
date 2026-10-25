"use client";

import { useEffect } from "react";
import { api, ApiError } from "./api";
import { apiUrl } from "./apiBase";
import { invalidateQueries } from "./useApi";

/**
 * 외부 캘린더 일정이 바뀌었나 (2026-10-25).
 *
 * 외부 일정은 **다른 앱이 쓴다** — 이 화면은 쓴 걸 모른다. 그래서 가벼운 도장(`stamp`)만 물어보고,
 * 바뀌었을 때만 `invalidateQueries()`로 전부 다시 읽는다 (다시 읽는 GET이 서버의 합계 맞추기를 돈다).
 *
 * - 상태를 안 든다 — 안 바뀌었으면 다시 그리지 않는다
 * - 마지막 도장은 **모듈에** 둔다. 화면을 오가도 기억해야 "다녀온 사이 바뀐 것"을 잡는다.
 *   열쇠가 전체 주소라 서버(포트)가 바뀌면 자연히 처음 보는 것이 된다
 * - 처음 읽은 값은 기준일 뿐이다 — 막 그린 화면을 또 읽을 이유가 없다
 * - 실패는 조용히 넘긴다. 404면 이 서버가 아직 모르는 기능이라 그 서버에는 다시 묻지 않는다
 */
const lastStamp = new Map<string, string>();
const unsupported = new Set<string>();

const POLL_MS = 30_000;

async function check(path: string) {
  let key: string;
  try {
    key = apiUrl(path);
  } catch {
    return;
  }
  if (unsupported.has(key)) return;
  try {
    const { stamp } = await api.get<{ stamp: string }>(path);
    if (typeof stamp !== "string") return;
    const before = lastStamp.get(key);
    lastStamp.set(key, stamp);
    if (before !== undefined && before !== stamp) invalidateQueries();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) unsupported.add(key);
  }
}

/**
 * `entryId`가 있으면 그 항목만(상세), 없으면 전체(라이브러리·대시보드).
 * `poll` — 보이는 동안 30초마다. 상세만 켠다 (일정이 끝나는 걸 그 자리에서 보고 있을 화면이다)
 */
export function useExternalPlayStamp(entryId?: number | string | null, poll = false) {
  useEffect(() => {
    const path = entryId == null || entryId === ""
      ? "/api/external-plays/stamp"
      : `/api/external-plays/stamp?entryId=${encodeURIComponent(String(entryId))}`;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const startPolling = () => {
      if (!poll || timer) return;
      timer = setInterval(() => void check(path), POLL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void check(path);
        startPolling();
      } else {
        stopPolling();
      }
    };
    const onFocus = () => void check(path);

    void check(path);
    if (document.visibilityState === "visible") startPolling();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopPolling();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [entryId, poll]);
}
