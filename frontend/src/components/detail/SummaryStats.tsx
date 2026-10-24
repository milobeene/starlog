"use client";

import { EditButton } from "@/components/ui/Field";
import StarIcon from "@/components/ui/StarIcon";
import PlayTime from "@/components/ui/PlayTime";
import { formatRating } from "@/lib/labels";
import type { DetailDialog } from "@/components/detail/detailDialog";
import type { BacklogDetail } from "@/lib/types";

/**
 * 요약 스탯 한 줄.
 *
 * divide-x/divide-y는 "첫 항목만 빼고 전부"라 2열↔4열 전환에서 선이 어긋난다
 * (2열일 때 두 번째 칸 위에도 가로선이 그어졌다). 몇 번째 칸인지로 직접 긋는다
 */
export default function SummaryStats({
  data,
  onOpen,
}: {
  data: BacklogDetail;
  onOpen: (dialog: DetailDialog) => void;
}) {
  const { resolved, personalRecord } = data;

  return (
    // 연필은 격자 밖에 둔다 — 칸이 늘면 nth-child 선 규칙이 어긋난다
    <div className="relative mb-10">
      <div className="absolute top-1 right-0 z-10 sm:top-1.5">
        <EditButton label="점수·플레이타임 수정" onClick={() => onOpen({ kind: "stats" })} />
      </div>
    <div className="grid grid-cols-2 border-t-line border-b-line py-6 md:grid-cols-4 [&>*]:border-white/15 [&>*:nth-child(2n)]:border-l [&>*:nth-child(n+3)]:border-t md:[&>*]:border-l md:[&>*:first-child]:border-l-0 md:[&>*:nth-child(n+3)]:border-t-0">
      <Stat
        label="Total Playtime"
        value={<PlayTime hours={personalRecord.playTimeHours} unitClassName="text-[0.6em] text-white/60" />}
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
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
      </div>
    </div>
  );
}
