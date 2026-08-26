"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Money, MonthlySpending } from "@/lib/types";
import MoneyText from "@/components/ui/Money";

/**
 * 월별 지출 꺾은선.
 *
 * **통화를 절대 합치지 않는다** (BR-ACQ-01) — 환율 변환은 범위 밖(Phase 10)이라
 * 더하면 조용히 틀린 숫자가 나간다. 통화마다 선을 따로 그린다.
 *
 * 라이브러리 없이 SVG로 그리는 이유 — 차트가 이거 하나뿐이라
 * recharts(~100KB)를 들이는 값을 못 한다
 */
const LINE_COLORS = ["#e5893a", "#6fb3ae", "#a78bfa"];
const MONTH_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const WIDTH = 1000;
const HEIGHT = 260;
const PAD = { top: 20, right: 56, bottom: 34, left: 64 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

export default function MonthlySpendingChart({ data }: { data: MonthlySpending }) {
  const years = useMemo(() => {
    const found = [...new Set(data.months.map((month) => Number(month.period.slice(0, 4))))];
    return found.length > 0 ? found.sort((a, b) => a - b) : [new Date().getFullYear()];
  }, [data.months]);

  const [year, setYear] = useState(() => years[years.length - 1]);
  const [hover, setHover] = useState<number | null>(null);

  /** 12개월을 고정으로 깔고 데이터가 있는 달만 채운다 — 없는 달은 null로 남긴다 */
  const series = useMemo(() => {
    const byMonth = new Map(data.months.map((month) => [month.period, month.amounts]));
    return Array.from({ length: 12 }, (_, index) => {
      const period = `${year}-${String(index + 1).padStart(2, "0")}`;
      return byMonth.get(period) ?? null;
    });
  }, [data.months, year]);

  /** 같은 12칸에 이름 목록도 깔아둔다 — 툴팁이 hover 인덱스 하나로 둘 다 집는다 */
  const itemsByMonth = useMemo(() => {
    const byMonth = new Map(data.months.map((month) => [month.period, month.items]));
    return Array.from({ length: 12 }, (_, index) => {
      const period = `${year}-${String(index + 1).padStart(2, "0")}`;
      return byMonth.get(period) ?? [];
    });
  }, [data.months, year]);

  const currencies = data.currencies;
  const hasAnyPoint = series.some((amounts) => amounts != null);

  /**
   * 통화마다 자기 최댓값으로 정규화한다. 전체 최댓값 하나로 잡으면
   * 소액 통화(USD)가 바닥에 눕어 모양이 안 읽힌다 — 축이 갈리는 대신 추이를 살린다
   */
  const maxByCurrency = useMemo(() => {
    const entries = currencies.map((currency) => {
      const values = series.map((amounts) => amounts?.[currency] ?? 0);
      return [currency, Math.max(...values, 1)] as const;
    });
    return Object.fromEntries(entries);
  }, [currencies, series]);

  const stepX = PLOT_W / 11;
  const xOf = (index: number) => PAD.left + index * stepX;
  const yOf = (value: number, currency: string) =>
    PAD.top + (1 - value / maxByCurrency[currency]) * PLOT_H;

  const yearIndex = years.indexOf(year);

  return (
    <div className="w-full">
      {/* 연도 전환 — 양쪽 버튼 */}
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={() => setYear(years[yearIndex - 1])}
          disabled={yearIndex <= 0}
          aria-label="이전 해"
          className="flex h-7 w-7 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
        >
          ‹
        </button>
        <span className="num min-w-[3.5rem] text-center text-sm font-medium tracking-wider">{year}</span>
        <button
          onClick={() => setYear(years[yearIndex + 1])}
          disabled={yearIndex < 0 || yearIndex >= years.length - 1}
          aria-label="다음 해"
          className="flex h-7 w-7 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
        >
          ›
        </button>

        <div className="ml-auto flex gap-4">
          {currencies.map((currency, index) => (
            <span key={currency} className="flex items-center gap-1.5 text-xs text-white/50">
              <span
                className="inline-block h-0.5 w-4"
                style={{ background: LINE_COLORS[index % LINE_COLORS.length] }}
              />
              {currency}
            </span>
          ))}
        </div>
      </div>

      {/*
        **onMouseLeave가 svg가 아니라 이 박스에 걸린다.** 툴팁 줄은 svg 바깥 형제라,
        svg에 걸어두면 포인터가 `+N` 버튼으로 내려가는 순간 hover가 풀려
        **버튼이 손에 닿기 전에 사라졌다.** 펼치기가 아예 도달 불가였다
      */}
      <div
        className="w-full overflow-x-auto rounded-sm border border-white/10 bg-black/10 p-4"
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-72 w-full min-w-[640px]">
          {/* 가로 눈금 + 세로 축 값 (첫 통화 기준) */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = PAD.top + ratio * PLOT_H;
            const primary = currencies[0];
            const value = primary ? maxByCurrency[primary] * (1 - ratio) : 0;
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
                {primary && (
                  <text x={PAD.left - 10} y={y + 4} textAnchor="end" fontSize="11" className="fill-white/30">
                    {compact(value)}
                  </text>
                )}
              </g>
            );
          })}

          {/* 꺾은선 — 데이터 없는 달은 건너뛰고 이어 그린다 */}
          {currencies.map((currency, index) => {
            const points = series
              .map((amounts, monthIndex) =>
                amounts == null ? null : ([monthIndex, amounts[currency] ?? 0] as const),
              )
              .filter((point): point is readonly [number, number] => point !== null);

            return (
              <g key={currency}>
                <polyline
                  points={points.map(([i, v]) => `${xOf(i)},${yOf(v, currency)}`).join(" ")}
                  fill="none"
                  stroke={LINE_COLORS[index % LINE_COLORS.length]}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {points.map(([i, v]) => (
                  <circle
                    key={i}
                    cx={xOf(i)}
                    cy={yOf(v, currency)}
                    r={hover === i ? 4 : 2.5}
                    fill={LINE_COLORS[index % LINE_COLORS.length]}
                  />
                ))}
              </g>
            );
          })}

          {/* 호버 세로선 */}
          {hover !== null && (
            <line
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="1"
            />
          )}

          {/* 12개월 라벨 — 지출이 없는 달도 축에는 남는다 */}
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

          {/*
            히트 영역을 따로 깐다 — 선과 점만으로는 마우스가 얹히는 면적이 너무 좁다.
            투명 사각형이 각 달의 세로 띠 전체를 받는다
          */}
          {MONTH_LABELS.map((label, index) => (
            <rect
              key={`hit-${label}`}
              x={xOf(index) - stepX / 2}
              y={PAD.top}
              width={stepX}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          ))}
        </svg>

        {/* 툴팁 — SVG 밖에 두면 위치 계산 없이 폭을 그대로 쓴다 */}
        <div className="mt-3 flex min-h-[1.5rem] items-center gap-4 border-t border-white/5 px-1 pt-3 text-xs">
          {hover === null ? (
            <span className="text-white/25">월 항목에 마우스를 올리시면 금액이 표시됩니다</span>
          ) : (
            <>
              <span className="num font-medium text-white/70">
                {year}-{String(hover + 1).padStart(2, "0")}
              </span>
              {series[hover] == null ? (
                <span className="text-white/30">지출 내역 없음</span>
              ) : (
                currencies.map((currency, index) => (
                  <span key={currency} className="flex items-center gap-1.5 text-white/60">
                    <span
                      className="inline-block h-0.5 w-3"
                      style={{ background: LINE_COLORS[index % LINE_COLORS.length] }}
                    />
                    <span className="num">
                      <MoneyText
                        money={{ amount: series[hover]?.[currency] ?? 0, currency } as Money}
                      />
                    </span>
                  </span>
                ))
              )}

              {/*
                구분선 + 그 달에 돈이 나간 것들. 금액만 있으면 "왜 이만큼 썼지"에 답이 안 된다.
                self-stretch라 위아래 글자 높이에 맞춰 늘어난다 — 고정 높이를 주면 어긋난다
              */}
              {itemsByMonth[hover].length > 0 && (
                <>
                  <span aria-hidden className="w-px self-stretch bg-white/15" />
                  {/* key가 달이라 다른 달로 옮기면 리마운트된다 — 펼친 상태가 따라오지 않는다 */}
                  <SpendingItems key={hover} items={itemsByMonth[hover]} />
                </>
              )}
            </>
          )}
        </div>

        {!hasAnyPoint && (
          <div className="pt-2 pb-1 text-center text-xs text-white/25">
            {year}년에는 등록된 지출 내역이 없습니다
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 그 달에 돈이 나간 것들 — 한 줄로 흘리고 넘치면 `…`.
 *
 * **잘렸을 때만 펼치기 버튼이 뜬다.** 항상 띄우면 다 보이는데도 누를 게 있어 헷갈린다.
 * 잘림 판정은 `scrollWidth > clientWidth`인데, 이건 **그려진 뒤에야 알 수 있다** —
 * 그래서 ResizeObserver로 잰다.
 *
 * 관찰자를 쓰는 두 번째 이유 — **박스 폭이 변할 때도 다시 재야 한다**(창 크기, 통화 개수).
 * 내용이 바뀌면 effect가 다시 붙고, observe()가 초기 콜백을 한 번 쏴서 재측정된다.
 *
 * 펼침 상태를 effect로 되돌리지 않는다. 호출부가 달 인덱스를 key로 주므로
 * 달이 바뀌면 이 컴포넌트가 통째로 새로 뜬다 — 상태 초기화는 리마운트가 하는 일이다
 */
function SpendingItems({ items }: { items: string[] }) {
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
        // 펼치면 줄바꿈으로 풀린다. min-w-0이 없으면 flex 자식이 안 줄어들어 truncate가 안 먹는다
        className={`min-w-0 text-white/45 ${expanded ? "break-words whitespace-normal" : "truncate"}`}
        title={text}
      >
        {text}
      </span>

      {/* 접혀 있고 잘렸을 때, 또는 이미 펼쳤을 때만 보인다 */}
      {(clipped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="num shrink-0 text-[10px] text-white/35 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
        >
          {/* 전체 개수가 아니라 "더 있다"는 표시다 — 몇 개가 가려졌는지는 알 수 없다 */}
          {expanded ? "접기" : "더보기"}
        </button>
      )}
    </span>
  );
}

/** 축 라벨용 축약 — 89800 → 89.8k */
function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(0);
}
