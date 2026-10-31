"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * 긴 글자 한 줄 — 넘칠 때만 음악 플레이어 제목처럼 잠깐 멈췄다 천천히 왼쪽으로 흘러 끝을 보이고, 멈췄다 돌아온다.
 * 안 넘치거나 `prefers-reduced-motion`이면 그냥 말줄임(+title). 칸 크기는 늘 그대로라 레이아웃이 안 흔들린다.
 * 넘침은 렌더 중에 못 재므로 ResizeObserver로 잰다 (레일 폭이 바뀌어도 따라온다)
 */
export default function Marquee({ children, className = "" }: { children: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [dist, setDist] = useState(0);

  useLayoutEffect(() => {
    const b = box.current;
    const t = text.current;
    if (!b || !t) return;
    const measure = () => setDist(Math.max(0, Math.ceil(t.scrollWidth - b.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    return () => ro.disconnect();
  }, [children]);

  // 속도 ~24px/s + 앞뒤 멈춤 — 이동은 전체 주기의 절반쯤이라 주기는 이동 시간의 2배 + 멈춤
  const cycle = dist > 0 ? (dist / 24) * 2 + 4 : 0;
  return (
    <span ref={box} title={dist > 0 ? children : undefined} className={`marquee-box block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${className}`}>
      <span
        ref={text}
        className={dist > 0 ? "marquee-run inline-block" : "inline"}
        style={dist > 0 ? ({ "--marquee-d": `${dist}px`, "--marquee-t": `${cycle}s` } as React.CSSProperties) : undefined}
      >
        {children}
      </span>
    </span>
  );
}
