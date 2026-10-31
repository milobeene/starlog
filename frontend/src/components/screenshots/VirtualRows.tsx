"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 줄 높이가 같은 긴 목록 — 보이는 줄(+여유)만 그린다. 스크롤은 부모 판넬(`data-panel-scroll`)이 가진다.
 * 게임이 수백 개여도 DOM은 수십 줄이다. 페이지로 끊지 않는다 (사용자 결정)
 */
export default function VirtualRows({ count, rowH, gap = 2, render }: { count: number; rowH: number; gap?: number; render: (index: number) => React.ReactNode }) {
  const box = useRef<HTMLUListElement>(null);
  const [range, setRange] = useState({ start: 0, end: 30 });
  const step = rowH + gap;

  useEffect(() => {
    const el = box.current;
    const scroller = el?.closest<HTMLElement>("[data-panel-scroll]");
    if (!el || !scroller) return;
    const read = () => {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const start = Math.max(0, Math.floor(-top / step) - 6);
      const end = Math.min(count, Math.ceil((scroller.clientHeight - top) / step) + 6);
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };
    read();
    scroller.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(scroller);
    return () => { scroller.removeEventListener("scroll", read); ro.disconnect(); };
  }, [count, step]);

  const end = Math.min(count, Math.max(range.end, range.start));
  return (
    <ul ref={box} className="relative" style={{ height: Math.max(0, count * step - gap) }}>
      <div style={{ position: "absolute", inset: "0 0 auto 0", transform: `translateY(${range.start * step}px)` }} className="flex flex-col gap-0.5">
        {Array.from({ length: Math.max(0, end - range.start) }, (_, k) => (
          <li key={range.start + k} style={{ height: rowH }}>{render(range.start + k)}</li>
        ))}
      </div>
    </ul>
  );
}
