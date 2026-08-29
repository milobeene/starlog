"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 대시보드 꺾은선 차트의 공용 부품 (2026-08-29).
 *
 * 지출 차트 하나뿐이던 것이 완료 차트와 둘이 되면서 뽑았다. **눈금·여백·연도 전환·
 * 항목 목록이 같아야 두 차트가 나란히 섰을 때 읽는 법이 같다** — 한쪽만 고쳐서
 * 어긋나는 것을 막으려면 값이 한 곳에 있어야 한다.
 *
 * 라이브러리 없이 SVG로 그리는 이유 — 차트가 둘뿐이라 recharts(~100KB)를 들이는 값을 못 한다.
 */
export const WIDTH = 1000;
export const HEIGHT = 260;
export const PAD = { top: 20, right: 56, bottom: 34, left: 64 };
export const PLOT_W = WIDTH - PAD.left - PAD.right;
export const PLOT_H = HEIGHT - PAD.top - PAD.bottom;
export const MONTH_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export const STEP_X = PLOT_W / 11;
export const xOf = (index: number) => PAD.left + index * STEP_X;

/** 축 라벨용 축약 — 89800 → 89.8k */
export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(0);
}

/** 데이터가 있는 해만 고른다. 하나도 없으면 올해 한 칸 */
export function yearsOf(periods: string[]): number[] {
  const found = [...new Set(periods.map((p) => Number(p.slice(0, 4))))];
  return found.length > 0 ? found.sort((a, b) => a - b) : [new Date().getFullYear()];
}

/** 연도 전환 — 양쪽 화살표. 데이터가 있는 해 사이만 오간다 */
export function ChartYearSwitch({
  years,
  year,
  onChange,
  children,
}: {
  years: number[];
  year: number;
  onChange: (year: number) => void;
  /** 오른쪽 끝에 붙는 범례 */
  children?: React.ReactNode;
}) {
  const index = years.indexOf(year);
  return (
    <div className="mb-3 flex items-center gap-3">
      <button
        onClick={() => onChange(years[index - 1])}
        disabled={index <= 0}
        aria-label="이전 해"
        className="flex h-7 w-7 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
      >
        ‹
      </button>
      <span className="num min-w-[3.5rem] text-center text-sm font-medium tracking-wider">
        {year}
      </span>
      <button
        onClick={() => onChange(years[index + 1])}
        disabled={index < 0 || index >= years.length - 1}
        aria-label="다음 해"
        className="flex h-7 w-7 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
      >
        ›
      </button>
      {children && <div className="ml-auto flex gap-4">{children}</div>}
    </div>
  );
}

/** 가로 눈금 + 왼쪽 축 값 */
export function ChartGrid({ max }: { max: number | null }) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = PAD.top + ratio * PLOT_H;
        return (
          <g key={ratio}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.4)"
              strokeDasharray="4 6"
              strokeWidth="1"
              opacity="0.15"
            />
            {max !== null && (
              <text
                x={PAD.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                className="fill-white/30"
              >
                {compact(max * (1 - ratio))}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

/** 12개월 축 라벨 + 히트 영역. 선과 점만으로는 마우스가 얹히는 면적이 너무 좁다 */
export function ChartMonthAxis({
  hover,
  onHover,
}: {
  hover: number | null;
  onHover: (index: number) => void;
}) {
  return (
    <>
      {MONTH_LABELS.map((label, index) => (
        <text
          key={label}
          x={xOf(index)}
          y={HEIGHT - 12}
          textAnchor="middle"
          fontSize="11"
          className={hover === index ? "fill-white/80" : "fill-white/30"}
        >
          {label}
        </text>
      ))}
      {MONTH_LABELS.map((label, index) => (
        <rect
          key={`hit-${label}`}
          x={xOf(index) - STEP_X / 2}
          y={PAD.top}
          width={STEP_X}
          height={PLOT_H}
          fill="transparent"
          onMouseEnter={() => onHover(index)}
        />
      ))}
    </>
  );
}

/**
 * 그 달의 항목들 — 한 줄로 흘리고 넘치면 `…`.
 *
 * **잘렸을 때만 펼치기 버튼이 뜬다.** 항상 띄우면 다 보이는데도 누를 게 있어 헷갈린다.
 * 잘림 판정은 `scrollWidth > clientWidth`인데 **그려진 뒤에야 알 수 있다** —
 * 그래서 ResizeObserver로 잰다. 박스 폭이 변할 때도 다시 재야 하므로 관찰자가 맞다.
 *
 * 펼침 상태를 effect로 되돌리지 않는다. 호출부가 달 인덱스를 key로 주므로
 * 달이 바뀌면 통째로 새로 뜬다 — 상태 초기화는 리마운트가 하는 일이다
 */
export function ChartItems({ items }: { items: string[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const text = items.join(", ");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setClipped(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span
        ref={ref}
        className={`min-w-0 text-white/45 ${expanded ? "break-words whitespace-normal" : "truncate"}`}
        title={text}
      >
        {text}
      </span>
      {(clipped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="num shrink-0 text-[10px] text-white/35 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
        >
          {expanded ? "접기" : "더보기"}
        </button>
      )}
    </span>
  );
}
