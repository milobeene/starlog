"use client";

import { useMemo, useState } from "react";
import type { Money, MonthlySpending } from "@/lib/types";
import MoneyText from "@/components/ui/Money";
import {
  ChartGrid,
  ChartItems,
  ChartMonthAxis,
  ChartYearSwitch,
  HEIGHT,
  PAD,
  PLOT_H,
  WIDTH,
  xOf,
  yearsOf,
} from "./chartBase";

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

export default function MonthlySpendingChart({ data }: { data: MonthlySpending }) {
  const years = useMemo(() => yearsOf(data.months.map((m) => m.period)), [data.months]);

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

  /** 그 해의 월평균. 12개월 고정 분모라 데이터가 없는 달도 분모에 든다 */
  const yearAverage = data.yearlyAverages.find((entry) => entry.year === year);

  const yOf = (value: number, currency: string) =>
    PAD.top + (1 - value / maxByCurrency[currency]) * PLOT_H;

  return (
    <div className="w-full">
      <ChartYearSwitch years={years} year={year} onChange={setYear}>
        {currencies.map((currency, index) => (
          <span key={currency} className="flex items-center gap-1.5 text-xs text-white/50">
            <span
              className="inline-block h-0.5 w-4"
              style={{ background: LINE_COLORS[index % LINE_COLORS.length] }}
            />
            {currency}
          </span>
        ))}
      </ChartYearSwitch>

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
          {/* 축 값은 첫 통화 기준이다 — 통화마다 스케일이 갈리므로 대표 하나만 적는다 */}
          <ChartGrid max={currencies[0] ? maxByCurrency[currencies[0]] : null} />

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

          <ChartMonthAxis hover={hover} onHover={setHover} />
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
                  <ChartItems key={hover} items={itemsByMonth[hover]} />
                </>
              )}
            </>
          )}
        </div>

        {/*
          빈 안내를 안 띄운다 (사용자 결정 2026-08-28). 빈 그래프가 이미 "없다"를
          말하고 있어서, 문장을 덧붙이면 같은 말을 두 번 하는 셈이다
        */}
      </div>

      {/*
        ⚠️ **연평균은 백엔드가 계산해 내려보내는데 화면이 안 그리고 있었다** (2026-08-29).
        만들어두고 안 붙인 상태라 사용자가 "본 적이 없다"고 했다.
        **분모는 12개월 고정**이다 — 데이터 있는 달만으로 나누면 연초에 몰아 산 해가
        부풀어 해끼리 비교가 안 된다
      */}
      {yearAverage && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 px-1 text-[11px] text-white/35">
          <span>
            <span className="num text-white/55">{year}</span>년 월평균
          </span>
          {currencies.map((currency) => (
            <span key={currency} className="num text-white/70">
              <MoneyText money={{ amount: yearAverage.amounts[currency] ?? 0, currency } as Money} />
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
