"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ToolButton, ToolGroup } from "@/components/ui/ToolButton";
import { UploadFailures } from "@/components/media/IngestProgress";
import MediaViewer from "@/components/library/MediaViewer";
import { api } from "@/lib/api";
import { getBridge } from "@/lib/desktop";
import { useEntryIngest } from "@/lib/ingest";
import { onMediaChanged } from "@/lib/mediaEvents";
import { invalidateQueries, useApi } from "@/lib/useApi";
import { usePick } from "@/lib/usePick";
import { useShotUpload } from "@/lib/useShotUpload";
import { newestFirst, type Shot } from "@/lib/shots";
import { useFileDrop } from "@/lib/useFileDrop";
import { useShotShortcuts } from "@/lib/useShotShortcuts";
import AddTile from "@/components/media/AddTile";
import ErrorNotice from "@/components/ui/ErrorNotice";
import { Skeleton } from "@/components/ui/Skeleton";
import { useIdlePreload } from "@/lib/useWindowedGrid";
import PaneHeader from "./PaneHeader";
import { SelectActions, SelectionCount, SelectToggle } from "./SelectBar";
import ShotGrid, { type GridItem } from "./ShotGrid";

/**
 * STARLOG 안 게임 하나의 스크린샷 — 보기 · 고르기 · 삭제 · 공유 · 폴더 열기 · 넣기.
 * DB에 행이 없고 폴더가 곧 목록이다 (탐색기로 넣고 지워도 폴더 감시가 알려 준다)
 */
export default function StarlogPane({ entryId, gameName }: { entryId: number; gameName: string }) {
  const list = useApi<Shot[]>(`/api/backlog/${entryId}/screenshots`);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ingest = useEntryIngest(entryId);
  const zone = useRef<HTMLDivElement>(null);

  const shots = useMemo(() => (list.data ? newestFirst(list.data) : null), [list.data]);

  const reload = list.reload;
  useEffect(() => onMediaChanged(reload), [reload]);
  const upload = useShotUpload(entryId, () => { reload(); invalidateQueries(); });

  /* 넣기가 끝나는 순간 목록을 다시 읽는다 — 화면을 떠났다 와도 마운트 시 조회가 받는다 */
  const wasIngesting = useRef(false);
  useEffect(() => {
    if (wasIngesting.current && !ingest) { reload(); invalidateQueries(); }
    wasIngesting.current = Boolean(ingest);
  }, [ingest, reload]);

  const items: GridItem[] = useMemo(
    () => (shots ?? []).map((s) => ({
      key: s.fileName, name: s.fileName, url: s.url, thumbUrl: s.thumbUrl, contentType: s.contentType,
      placeholder: s.placeholder, takenMs: s.takenAt ? new Date(s.takenAt).getTime() : null,
    })),
    [shots],
  );
  const listKey = shots?.map((s) => s.fileName).join("\n") ?? null;
  const { selectMode, setSelectMode, selected, allSelected, pick, toggleAll, selectAll, clear, cancel } = usePick(items.length, listKey);

  useIdlePreload(useMemo(() => items.map((i) => i.thumbUrl), [items]), viewing === null);

  const chosen = useMemo(() => [...selected].sort((a, b) => a - b).flatMap((i) => (shots?.[i] ? [shots[i]] : [])), [selected, shots]);

  const removeSelected = async () => {
    // ConfirmDialog가 실패를 받아 보여주도록 던진다
    try {
      await api.post(`/api/backlog/${entryId}/screenshots/delete`, chosen.map((s) => s.fileName));
    } finally {
      clear();
      reload();
      invalidateQueries();
    }
  };

  const openFolder = async () => {
    const { path } = await api.post<{ path: string }>(`/api/backlog/${entryId}/screenshots/folder`);
    getBridge()?.openPath(path);
  };

  const blocked = upload.busy || Boolean(ingest);
  const drop = useFileDrop({ onFiles: upload.add, disabled: blocked, zone });
  useShotShortcuts({
    enabled: viewing === null && !confirmDelete,
    selectMode,
    selectedCount: selected.size,
    itemCount: items.length,
    onToggleMode: () => setSelectMode(true),
    onSelectAll: selectAll,
    onCancel: cancel,
    onDelete: () => setConfirmDelete(true),
  });

  const closeViewer = useCallback(() => setViewing(null), []);
  const count = shots?.length ?? null;

  const chosenTargets = chosen.map((s) => ({ entryId, fileName: s.fileName }));
  const errorText = upload.error ?? (list.error ? "스크린샷을 불러오지 못했습니다." : null);

  return (
    <div
      ref={zone}
      {...drop.handlers}
      className="min-h-0 min-w-0 flex-1 overflow-y-auto"
      data-pane="starlog"
      data-scroller
    >
      {/* 여백은 안쪽 상자가 가진다 — 스크롤러에 패딩을 주면 sticky의 top이 패딩 안쪽부터 재져서 판넬이 그만큼 아래에 선다 */}
      <div className="page-x pt-[4.5rem] pb-10 lg:pt-20">
      <PaneHeader
        title={gameName}
        href={`/library/detail?entry=${entryId}`}
        count={count}
        left={selectMode ? <SelectionCount count={selected.size} /> : null}
      >
        {getBridge() && (
          <ToolGroup label="열기">
            <ToolButton icon="folder" short onClick={() => void openFolder()} title="탐색기에서 이 게임의 스크린샷 폴더 열기">폴더 열기</ToolButton>
          </ToolGroup>
        )}
        {selectMode && (
          <SelectActions allSelected={allSelected} onToggleAll={toggleAll} shareTargets={chosenTargets} deleteCount={selected.size} deleteDisabled={upload.busy} onDelete={() => setConfirmDelete(true)} />
        )}
        <SelectToggle selectMode={selectMode} disabled={!selectMode && items.length === 0} onClick={() => (selectMode ? cancel() : setSelectMode(true))} />
      </PaneHeader>

      <div className="mt-4">
        {(errorText || drop.rejected) && (
          <p role="alert" className="mb-3 text-xs text-red-400">{errorText ?? drop.rejected}</p>
        )}
        <UploadFailures failed={upload.failed} onClose={upload.clearFailed} />

        {list.error && !shots ? (
          <ErrorNotice error={list.error} onRetry={reload} />
        ) : list.loading && !shots ? (
          <div data-loading className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-video w-full rounded-lg" />)}
          </div>
        ) : (
          <>
            <ShotGrid
              items={items}
              selectMode={selectMode}
              selected={selected}
              onOpen={setViewing}
              onPick={(index, event) => { if (!selectMode) setSelectMode(true); pick(index, event); }}
              lead={<AddTile onFiles={upload.add} over={drop.over} disabled={blocked} uploading={upload.busy} ingest={ingest} />}
            />
            {items.length === 0 && <p className="mt-4 text-center text-xs text-white/30" data-empty>아직 이 게임의 스크린샷이 없습니다.</p>}
          </>
        )}
      </div>

      </div>
      {viewing !== null && shots && <MediaViewer items={shots} index={viewing} onIndex={setViewing} onClose={closeViewer} />}
      {confirmDelete && (
        <ConfirmDialog
          title="삭제"
          message={`선택한 ${selected.size}개를 삭제합니다. 썸네일도 함께 지워지며 되돌릴 수 없습니다.`}
          confirmLabel={`${selected.size}개 삭제`}
          onConfirm={removeSelected}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
