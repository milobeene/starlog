"use client";

import StarIcon from "@/components/ui/StarIcon";
import { formatHours } from "@/lib/format";
import { formatRating } from "@/lib/labels";
import type { BacklogDetail } from "@/lib/types";

/**
 * 요약 스탯 한 줄.
 *
 * divide-x/divide-y는 "첫 항목만 빼고 전부"라 2열↔4열 전환에서 선이 어긋난다
 * (2열일 때 두 번째 칸 위에도 가로선이 그어졌다). 몇 번째 칸인지로 직접 긋는다
 */
export default function SummaryStats({ data }: { data: BacklogDetail }) {
  const { resolved, personalRecord } = data;
  const totalPlaytime = formatHours(personalRecord.playTimeHours);

  return (
    <div className="mb-10 grid grid-cols-2 border-t-line border-b-line py-6 md:grid-cols-4 [&>*]:border-white/15 [&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t md:[&>*]:border-l md:[&>*:first-child]:border-l-0 md:[&>*:nth-child(n+3)]:border-t-0">
      <Stat
        label="Total Playtime"
        value={totalPlaytime ?? "—"}
        unit={totalPlaytime == null ? undefined : "h"}
      />
      <Stat label="Playthroughs" value={data.playthroughs.length} />
      <Stat
        label="My Rating"
        value={
          personalRecord.rating == null ? (
            "—"
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <StarIcon className="h-[0.8em] w-[0.8em] -translate-y-[1px] text-white/35" />
              {formatRating(personalRecord.rating)}
            </span>
          )
        }
      />
      <Stat label="Release Date" value={resolved.releasedOn ?? "—"} />
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    /*
     * 폰에서는 칸이 반으로 줄어 날짜(2016-02-26)가 세 줄로 깨진다 — 글자와 좌우 여백을 줄인다.
     *
     * py는 **두 줄로 접힐 때만** 필요하다. 바깥 테두리는 컨테이너의 py-6만큼 떨어져 있는데
     * 줄 사이 가로선만 위 숫자에 딱 붙어 어색했다. 한 줄이 되는 md부터는 다시 0
     */
    <div className="flex flex-col justify-center px-3 py-2.5 sm:px-6 md:py-0">
      <div className="mb-1 text-[10px] tracking-wider text-white/40 uppercase sm:text-xs">{label}</div>
      <div className="num text-lg font-normal sm:text-2xl">
        {value}
        {unit && <span className="ml-0.5 text-sm text-white/60 sm:text-lg">{unit}</span>}
      </div>
    </div>
  );
}
