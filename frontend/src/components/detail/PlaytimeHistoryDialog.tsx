"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Pagination from "@/components/ui/Pagination";
import Unit from "@/components/ui/Unit";
import DataTable from "@/components/library/DataTable";
import PlayRecordDialog from "@/components/detail/PlayRecordDialog";
import { Button } from "@/components/ui/Field";
import { formatSignedMinutes } from "@/lib/format";
import { PLAY_RECORD_KIND_LABEL } from "@/lib/labels";
import { invalidateQueries, useApi } from "@/lib/useApi";
import type { PageResponse, PlayRecord } from "@/lib/types";

/** 한 쪽 10줄 — 팝업이 스크롤 없이 들어가는 만큼 (줄 높이 약 44px) */
const PAGE_SIZE = 10;

/**
 * 플레이타임 기록 목록 (v2 S4) — 점수·플레이타임 팝업의 [Playtime History]가 그 위에 겹쳐 연다.
 * 기록은 평생 늘어나서 상세 화면에 두지 않고 쪽으로 나눈다.
 *
 * 합계(요약 줄의 Total Playtime)가 **이 기록들의 합**이다. 행을 누르면 고치고, [기록 추가]로 더한다.
 * homeops 일정 행은 누를 수 없다 — homeops 캘린더가 쓴 것이라 거기서 고친다.
 * 아직 안 끝난 일정은 합계에 안 들어가서 흐리게 "예정"으로 둔다.
 *
 * 고치거나 지우면 전역 무효화로 목록이 **같은 쪽에서** 다시 읽힌다. 그 쪽이 비었으면(마지막 줄을 지웠다)
 * 한 쪽 앞으로 돌아간다. 뒤에 깔린 팝업은 `onChanged`로 새 합계를 알린다
 */
export default function PlaytimeHistoryDialog({
  entryId,
  onClose,
  onChanged,
}: {
  entryId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [page, setPage] = useState(0);
  // undefined = 안 열림, null = 추가, 기록 = 수정
  const [editing, setEditing] = useState<PlayRecord | null | undefined>(undefined);
  const { data, error } = useApi<PageResponse<PlayRecord>>(
    `/api/backlog/${entryId}/play-records?page=${page}&size=${PAGE_SIZE}`,
  );
  const records = data?.items ?? [];

  // 마지막 줄을 지우면 그 쪽이 통째로 비어 범위 밖이 된다 — 남은 마지막 쪽으로
  useEffect(() => {
    if (data && data.items.length === 0 && data.page > 0) {
      const last = Math.max(data.totalPages - 1, 0);
      queueMicrotask(() => setPage(last));
    }
  }, [data]);

  return (
    <>
      <Modal
        title="Playtime History"
        width="max-w-2xl"
        onClose={onClose}
        footer={
          <>
            <span className="num mr-auto text-xs text-white/30">
              {data?.totalElements ?? 0}
              <Unit space>records</Unit>
            </span>
            <Button onClick={() => setEditing(null)}>기록 추가</Button>
            <Button onClick={onClose}>닫기</Button>
          </>
        }
      >
        {error && !data ? (
          <p className="py-6 text-center text-xs text-red-400">기록을 불러오지 못했습니다</p>
        ) : (
          <DataTable
            headers={["Date", "Kind", "Time", "Note"]}
            empty={data && records.length === 0 ? "등록된 플레이 기록이 없습니다" : undefined}
          >
            {records.map((record) => (
              <tr
                key={`${record.source}-${record.recordId}`}
                onClick={record.editable ? () => setEditing(record) : undefined}
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
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} className="mt-4" />}
      </Modal>

      {/* 형제로 둔다 — 이 팝업의 자식이면 수정 팝업의 Enter가 React 트리로 올라온다 */}
      {editing !== undefined && (
        <PlayRecordDialog
          entryId={entryId}
          record={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            invalidateQueries();
            onChanged();
          }}
        />
      )}
    </>
  );
}
