"use client";

import { useMemo, useState } from "react";
import type { MonthlyCompletions } from "@/lib/types";
import Unit from "@/components/ui/Unit";
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
 * 월별 완료 꺾은선 (2026-08-29).
 *
 * 지출 차트와 **같은 자리에 같은 모양**으로 선다 — 눈금·연도 전환·툴팁이 공용 부품이다.
 * 다른 것은 셋뿐: 선이 하나고(통화가 없다), 색이 다르고, 요약이 **연합계**다.
 *
 * 0인 달을 null로 두지 않고 **0으로 그린다.** 지출은 "안 샀다"와 "기록이 없다"가
 * 다르지만, 완료는 안 깼으면 0이 사실이다 — 선이 끊기면 오히려 없는 달을 감춘다
 */
const LINE = "#7cc6a0";

export default function MonthlyCompletionsChart({ data }: { data: MonthlyCompletions }) {
  const years = useMemo(() => yearsOf(data.months.map((m) => m.period)), [data.months]);
  const [year, setYear] = useState(() => years[years.length - 1]);
  const [hover, setHover] = useState<number | null>(null);

  const { counts, itemsByMonth } = useMemo(() => {
    const byMonth = new Map(data.months.map((m) => [m.period, m]));
    const counts: number[] = [];
    const itemsByMonth: string[][] = [];
    for (let i = 0; i < 12; i++) {
      const found = byMonth.get(`${year}-${String(i + 1).padStart(2, "0")}`);
      counts.push(found?.count ?? 0);
      itemsByMonth.push(found?.items ?? []);
    }
    return { counts, itemsByMonth };
  }, [data.months, year]);

  /** 축 최댓값. 1보다 작게 잡으면 0인 해에서 0으로 나눈다 */
  const max = Math.max(...counts, 1);
  const yOf = (value: number) => PAD.top + (1 - value / max) * PLOT_H;

  const yearTotal = data.years.find((y) => y.year === year)?.count ?? 0;

  return (
    <div className="w-full">
      <ChartYearSwitch years={years} year={year} onChange={setYear}>
        <span className="flex items-center gap-1.5 text-xs text-white/50">
          <span className="inline-block h-0.5 w-4" style={{ background: LINE }} />
          완료
        </span>
      </ChartYearSwitch>

      <div
        className="w-full overflow-x-auto rounded-sm border border-white/10 bg-black/10 p-4"
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-72 w-full min-w-[640px]">
          <ChartGrid max={max} />

          <polyline
            points={counts.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ")}
            fill="none"
            stroke={LINE}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {counts.map((v, i) => (
            <circle key={i} cx={xOf(i)} cy={yOf(v)} r={hover === i ? 4 : 2.5} fill={LINE} />
          ))}

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

        <div className="mt-3 flex min-h-[1.5rem] items-center gap-4 border-t border-white/5 px-1 pt-3 text-xs">
          {hover === null ? (
            <span className="text-white/25">월 항목에 마우스를 올리시면 완료 수가 표시됩니다</span>
          ) : (
            <>
              <span className="num font-medium text-white/70">
                {year}-{String(hover + 1).padStart(2, "0")}
              </span>
              {counts[hover] === 0 ? (
                <span className="text-white/30">완료한 게임 없음</span>
              ) : (
                <span className="flex items-center gap-1.5 text-white/60">
                  <span className="inline-block h-0.5 w-3" style={{ background: LINE }} />
                  <span className="num">
                    {counts[hover]}
                    <Unit>개</Unit>
                  </span>
                </span>
              )}
              {itemsByMonth[hover].length > 0 && (
                <>
                  <span aria-hidden className="w-px self-stretch bg-white/15" />
                  <ChartItems key={hover} items={itemsByMonth[hover]} />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/*
        연합계. 지출은 연평균이지만 완료는 합계다 — "올해 몇 개 깼나"가 자연스럽다.
        요약이 차트 아래 같은 자리에 있어야 두 차트를 번갈아 볼 때 눈이 안 흔들린다
      */}
      <p className="mt-2 px-1 text-[11px] text-white/35">
        <span className="num text-white/55">{year}</span>년에 완료{" "}
        <span className="num text-white/70">{yearTotal}</span>
        <Unit>개</Unit>
      </p>
    </div>
  );
}
