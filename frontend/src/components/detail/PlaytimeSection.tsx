"use client";

import Unit from "@/components/ui/Unit";
import SectionIcon from "@/components/ui/SectionIcon";
import DataTable from "@/components/library/DataTable";
import { Button } from "@/components/ui/Field";
import type { DetailDialog } from "@/components/detail/detailDialog";
import { formatSignedMinutes } from "@/lib/format";
import { PLAY_RECORD_KIND_LABEL } from "@/lib/labels";
import { useApi } from "@/lib/useApi";
import type { PlayRecord } from "@/lib/types";

/**
 * 플레이타임 기록 — 합계(요약 줄의 Total Playtime)가 **이 기록들의 합**이다 (v2 S4).
 *
 * 회차·구매 표와 같은 틀: 행을 누르면 고치고, 제목 옆 버튼으로 추가한다.
 * homeops 일정 행은 누를 수 없다 — homeops 캘린더가 쓴 것이라 거기서 고친다.
 * 아직 안 끝난 일정은 합계에 안 들어가서 흐리게 "예정"으로 둔다
 */
export default function PlaytimeSection({
  entryId,
  onOpen,
}: {
  entryId: number;
  onOpen: (dialog: DetailDialog) => void;
}) {
  // 상세와 따로 읽는다 — 저장 뒤 전역 무효화가 둘 다 다시 읽게 한다
  const { data } = useApi<PlayRecord[]>(`/api/backlog/${entryId}/play-records`);
  const records = data ?? [];

  return (
    <section>
      <h3 className="mb-4 flex items-center justify-between gap-3 text-base font-medium text-white/90 sm:text-lg">
        <span className="flex items-center gap-2">
          <SectionIcon name="hourglass" />
          Playtime History
        </span>
        <span className="flex items-center gap-3">
          <span className="num text-xs text-white/30">
            {records.length}
            <Unit space>records</Unit>
          </span>
          <Button onClick={() => onOpen({ kind: "playRecord", record: null })}>기록 추가</Button>
        </span>
      </h3>
      <DataTable
        headers={["Date", "Kind", "Time", "Note"]}
        empty={data && records.length === 0 ? "등록된 플레이 기록이 없습니다" : undefined}
      >
        {records.map((record) => (
          <tr
            key={`${record.source}-${record.recordId}`}
            onClick={record.editable ? () => onOpen({ kind: "playRecord", record }) : undefined}
            title={record.editable ? undefined : "homeops 캘린더의 일정입니다. 캘린더에서 고쳐 주세요"}
            className={`transition-colors ${record.editable ? "cursor-pointer hover:bg-white/[0.05]" : ""} ${
              record.counted ? "" : "opacity-45"
            }`}
          >
            <td className="num px-4 py-3 text-white/60">{record.playedOn}</td>
            <td className="px-4 py-3 text-white/90">
              {PLAY_RECORD_KIND_LABEL[record.kind]}
              {!record.counted && <span className="ml-1.5 text-xs text-white/40">예정</span>}
            </td>
            <td className={`num px-4 py-3 ${record.minutes < 0 ? "text-white/45" : "text-white/80"}`}>
              {formatSignedMinutes(record.minutes)}
            </td>
            <td className="px-4 py-3 text-white/50">
              {record.source === "HOMEOPS" && record.startedAt && record.endedAt && (
                <span className="num mr-2 text-white/35">
                  {record.startedAt.slice(11, 16)}–{record.endedAt.slice(11, 16)}
                </span>
              )}
              {record.note ?? (record.source === "HOMEOPS" ? "" : "—")}
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
