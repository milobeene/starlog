"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bridgeMessage, getBridge, type InboxScan } from "@/lib/desktop";

/** 같은 폴더를 이 간격보다 자주 다시 읽지 않는다 — 감시가 연달아 울려도 훑기가 끝까지 돈다 */
const MIN_GAP_MS = 4000;
const TIMEOUT_MS = 90_000;

const signature = (scan: InboxScan) =>
  `${scan.truncated}|${scan.groups.map((g) => `${g.key}:${g.count}:${g.items[0]?.takenAtMs ?? 0}:${g.items[g.items.length - 1]?.takenAtMs ?? 0}`).join("|")}`;

/**
 * 외부 폴더 훑기 — 폴더마다 마지막 결과를 들고 있고, 보고 있는 폴더만 읽는다.
 *
 * ## 🐛 "3DS Screenshots 탭이 끝없이 로딩"의 원인
 *
 * 예전 인박스는 훑기를 `useEffect([sourceId, nonce])`로 걸고 **cleanup에서 결과를 버렸다(`alive=false`).**
 * 감시가 울릴 때마다 `nonce`가 올라 진행 중이던 훑기를 버리고 새로 시작했다 — 사진이 많은 폴더는 훑기가 몇 초 걸리는데,
 * 그 사이에 감시가 또 울리면(썸네일을 만들려고 원본을 읽는 일도 윈도우에선 변경으로 잡힐 수 있다) **어느 훑기도 끝까지 못 가고**
 * 화면은 "읽는 중"에 머문다. 탭을 누르면 가진 결과도 지워서(`setScan(null)`) 더 그랬다.
 *
 * 여기서는: ① 진행 중인 훑기를 **버리지 않는다** — 겹친 요청은 "끝나면 한 번 더"로 합친다 ② 다시 읽기는 최소 간격을 둔다
 * ③ 결과가 그대로면(지문 같음) 상태를 안 바꾼다 ④ 폴더를 바꿔도 이전 결과를 지우지 않는다 ⑤ 90초가 넘으면 오류와 [다시 시도]
 */
export function useSourceScan(sourceId: string | null, firstKey: string | null) {
  const sourcesApi = getBridge()?.sources;
  const [scans, setScans] = useState<Record<string, InboxScan>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const flight = useRef(new Map<string, { again: boolean }>());
  const lastEnd = useRef(new Map<string, number>());
  const sigs = useRef(new Map<string, string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const keyRef = useRef(firstKey);
  /* run ↔ later가 서로를 부른다 — ref로 끊는다 */
  const laterRef = useRef<(id: string) => void>(() => {});
  useEffect(() => { keyRef.current = firstKey; }, [firstKey]);

  const run = useCallback((id: string) => {
    if (!sourcesApi) return;
    const running = flight.current.get(id);
    if (running) { running.again = true; return; }
    const job = { again: false };
    flight.current.set(id, job);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("TIMEOUT")), TIMEOUT_MS); });
    void Promise.race([sourcesApi.scan(id, keyRef.current), limit])
      .then((result) => {
        const sig = signature(result);
        if (sigs.current.get(id) !== sig) {
          sigs.current.set(id, sig);
          setScans((cur) => ({ ...cur, [id]: result }));
        }
        setErrors((cur) => (id in cur ? Object.fromEntries(Object.entries(cur).filter(([k]) => k !== id)) : cur));
      })
      .catch((caught: unknown) => {
        const message = caught instanceof Error && caught.message === "TIMEOUT"
          ? "폴더를 읽는 데 너무 오래 걸립니다. 잠시 뒤 다시 시도해 주세요."
          : bridgeMessage(caught, "폴더를 읽지 못했습니다.");
        setErrors((cur) => ({ ...cur, [id]: message }));
      })
      .finally(() => {
        clearTimeout(timer);
        flight.current.delete(id);
        lastEnd.current.set(id, Date.now());
        if (job.again) laterRef.current(id);
      });
  }, [sourcesApi]);

  /** 최소 간격을 지켜서 (마지막 읽기가 끝난 지 오래면 바로) */
  const later = useCallback((id: string) => {
    if (timers.current.has(id)) return;
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - (lastEnd.current.get(id) ?? 0)));
    timers.current.set(id, setTimeout(() => { timers.current.delete(id); run(id); }, wait));
  }, [run]);
  useEffect(() => { laterRef.current = later; }, [later]);

  /** 보는 폴더가 바뀌면 — 가진 결과는 그대로 보이고, 뒤에서 한 번 읽는다 */
  useEffect(() => {
    if (sourceId) run(sourceId);
  }, [sourceId, run]);

  /* 화면이 열려 있는 동안만 등록 폴더를 감시한다 (탐색기·스팀이 새 사진을 넣으면 다시 읽기) */
  useEffect(() => {
    if (!sourcesApi) return;
    void sourcesApi.watch().catch(() => {});
    let dirty = false;
    const off = sourcesApi.onChanged((c) => {
      if (c.sourceId !== sourceId) return;
      // 창이 안 보일 때 온 변화는 다시 보일 때 한 번 — 배경에서 큰 폴더를 훑지 않는다
      if (document.hasFocus()) later(c.sourceId); else dirty = true;
    });
    const onFocus = () => {
      if (!dirty || !sourceId) return;
      dirty = false;
      later(sourceId);
    };
    window.addEventListener("focus", onFocus);
    const pending = timers.current;
    return () => {
      off();
      window.removeEventListener("focus", onFocus);
      void sourcesApi.unwatch().catch(() => {});
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, [sourcesApi, sourceId, later]);

  /** 바로 다시 읽기 (옮기기가 끝났을 때·[다시 시도]) — 간격을 기다리지 않는다 */
  const reload = useCallback((id: string) => {
    setErrors((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== id)));
    run(id);
  }, [run]);

  /** 옮긴 장을 바로 뺀다 (다시 읽기 전에도 안 남게) */
  const drop = useCallback((id: string, rels: Set<string>) => {
    setScans((cur) => {
      const scan = cur[id];
      if (!scan) return cur;
      const groups = scan.groups
        .map((g) => { const left = g.items.filter((it) => !rels.has(it.rel)); return { ...g, items: left, count: left.length }; })
        .filter((g) => g.items.length > 0);
      return { ...cur, [id]: { ...scan, groups } };
    });
    sigs.current.delete(id);
  }, []);

  const scan = sourceId ? scans[sourceId] ?? null : null;
  const error = sourceId ? errors[sourceId] ?? null : null;
  return { scan, error, loading: Boolean(sourceId) && !scan && !error, reload, drop };
}
