"use client";

import { useEffect, useState } from "react";

/**
 * 칸이 16:9로 똑같은 그리드에서 **보이는 줄(+ 위아래 여유)만** 그린다.
 *
 * 모든 게임 갤러리가 3000칸이면 DOM이 1만 8천 개였다 — 레이아웃·스타일 계산이 스크롤마다 그만큼 돈다.
 * 칸 크기가 다 같으니 줄 높이 하나로 위치를 계산할 수 있다.
 *
 * - 열 수·간격은 **그리드 자신의 계산된 스타일**에서 읽는다 — Tailwind 클래스(`grid-cols-*`)가 그대로 기준이다
 * - 보이는 범위는 바깥 상자의 화면상 위치로 잰다 — 스크롤하는 게 갤러리 본문이든 상세의 `<main>`이든 상관없다
 *   (문서 전체의 scroll을 capture로 듣는다)
 *
 * 쓰는 쪽: 바깥 상자(`attachOuter`, `position: relative`, 높이 = `height`) 안에 그리드(`attachGrid`, `absolute`, `top`)를 두고
 * `items.slice(start, end)`만 그린다
 */
export function useWindowedGrid(count: number, { overscanRows = 3, aspect = 16 / 9 } = {}) {
  /* 상태로 든다 — 목록이 오고 나서야 붙는 요소라, 붙는 순간 다시 재야 한다 */
  const [outer, setOuter] = useState<HTMLDivElement | null>(null);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<{ cols: number; rowH: number; rowGap: number } | null>(null);
  /** 바깥 상자 기준으로 화면에 보이는 구간(px) */
  const [view, setView] = useState<{ top: number; bottom: number }>({ top: 0, bottom: 1200 });

  useEffect(() => {
    if (!outer || !grid) return;
    const readView = () => {
      const rect = outer.getBoundingClientRect();
      const top = Math.max(0, -rect.top);
      const bottom = Math.max(top, window.innerHeight - rect.top);
      setView((v) => (Math.abs(v.top - top) < 1 && Math.abs(v.bottom - bottom) < 1 ? v : { top, bottom }));
    };
    const readGeo = () => {
      const cs = getComputedStyle(grid);
      const cols = Math.max(1, cs.gridTemplateColumns.split(" ").filter(Boolean).length);
      const colGap = parseFloat(cs.columnGap) || 0;
      const rowGap = parseFloat(cs.rowGap) || 0;
      const width = grid.clientWidth || outer.clientWidth;
      const rowH = (width - colGap * (cols - 1)) / cols / aspect + rowGap;
      if (!(rowH > 0)) return;
      setGeo((g) => (g && g.cols === cols && Math.abs(g.rowH - rowH) < 0.5 && g.rowGap === rowGap ? g : { cols, rowH, rowGap }));
    };
    // 처음 붙일 때도 한 번 알려 준다 — 그리기 전에 와서 첫 화면부터 맞는 줄이 그려진다
    const ro = new ResizeObserver(() => { readGeo(); readView(); });
    ro.observe(outer);
    ro.observe(grid);
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; readView(); });
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      ro.disconnect();
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [outer, grid, aspect]);

  const cols = geo?.cols ?? 4;
  const rowH = geo?.rowH ?? 160;
  const totalRows = Math.ceil(count / cols);
  const first = Math.max(0, Math.floor(view.top / rowH) - overscanRows);
  const last = Math.min(Math.max(0, totalRows - 1), Math.ceil(view.bottom / rowH) + overscanRows);
  return {
    /** 바깥 상자에 `ref`로 — 이름이 `…Ref`가 아닌 건 상태 설정자라서 (React 컴파일러가 렌더 중 ref 읽기로 오해한다) */
    attachOuter: setOuter,
    attachGrid: setGrid,
    start: Math.min(count, first * cols),
    end: Math.min(count, (last + 1) * cols),
    /** 그리드를 내릴 거리(px) */
    top: geo ? first * geo.rowH : 0,
    /** 바깥 상자 높이(px). 재기 전에는 null — 그동안은 그리드가 제 높이로 선다 */
    height: geo ? Math.max(0, totalRows * geo.rowH - geo.rowGap) : null,
  };
}

/**
 * 한가할 때 나머지 썸네일을 미리 받아 둔다 — 스크롤해 내려가도 빈 칸이 안 보이게.
 * `new Image()`를 들고 있어야 메모리 캐시에 남는다 (놓으면 치워질 수 있다). 4장씩, 화면이 바쁘면 다음 한가한 틈에.
 * **창에 포커스가 있을 때만** — 아직 없는 썸네일은 이 요청이 메인에서 만들게 하는데, 사용자가 게임 중이면 그 CPU를 뺏는다
 */
export function useIdlePreload(urls: (string | null)[], enabled: boolean, limit = 2000) {
  useEffect(() => {
    if (!enabled || urls.length === 0) return;
    const list = urls.filter((u): u is string => Boolean(u)).slice(0, limit);
    const held: HTMLImageElement[] = [];
    let i = 0;
    let inflight = 0;
    let stopped = false;
    let handle: number | null = null;
    const idle = (fn: () => void) =>
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(fn, { timeout: 1000 })
        : window.setTimeout(fn, 50);
    const cancelIdle = (h: number) =>
      typeof window.cancelIdleCallback === "function" ? window.cancelIdleCallback(h) : window.clearTimeout(h);
    const pump = () => {
      handle = null;
      if (!document.hasFocus()) return; // 돌아오면 focus가 다시 부른다
      while (!stopped && inflight < 4 && i < list.length) {
        const image = new Image();
        image.decoding = "async";
        inflight++;
        image.onload = image.onerror = () => {
          inflight--;
          if (!stopped && handle === null) handle = idle(pump);
        };
        image.src = list[i++];
        held.push(image);
      }
    };
    const onFocus = () => {
      if (!stopped && handle === null) handle = idle(pump);
    };
    window.addEventListener("focus", onFocus);
    // 보이는 칸이 먼저 받도록 조금 늦게 시작한다
    const startTimer = window.setTimeout(() => { handle = idle(pump); }, 600);
    return () => {
      stopped = true;
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(startTimer);
      if (handle !== null) cancelIdle(handle);
      held.length = 0;
    };
  }, [urls, enabled, limit]);
}
