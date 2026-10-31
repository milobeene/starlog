"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Field";
import { ToolButton, ToolGroup } from "@/components/ui/ToolButton";
import DropZone from "@/components/media/DropZone";
import { IngestProgress, UploadFailures } from "@/components/media/IngestProgress";
import ShareMenu from "@/components/media/ShareMenu";
import MediaViewer from "@/components/library/MediaViewer";
import { api } from "@/lib/api";
import { backendUrl } from "@/lib/apiBase";
import { getBridge } from "@/lib/desktop";
import { useEntryIngest } from "@/lib/ingest";
import { onMediaChanged } from "@/lib/mediaEvents";
import { invalidateQueries, useApi } from "@/lib/useApi";
import { usePick } from "@/lib/usePick";
import { useShotUpload } from "@/lib/useShotUpload";
import { useIdlePreload } from "@/lib/useWindowedGrid";
import PaneHeader from "./PaneHeader";
import ShotGrid, { type GridItem } from "./ShotGrid";

type Shot = {
  fileName: string;
  url: string;
  sizeBytes: number;
  contentType: string;
  takenAt: string | null;
  thumbUrl: string | null;
  placeholder?: string | null;
};

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

  /* 찍은 순서의 반대(최신이 앞) — 큰 화면에서는 방금 찍은 것이 먼저 보여야 한다. 절대 주소로 바꾸는 곳도 여기 한 곳 */
  const shots = useMemo(() => list.data
    ? [...list.data]
        .sort((a, b) => (b.takenAt ?? "").localeCompare(a.takenAt ?? "") || b.fileName.localeCompare(a.fileName))
        .map((shot) => ({ ...shot, url: backendUrl(shot.url), thumbUrl: shot.thumbUrl ? backendUrl(shot.thumbUrl) : null }))
    : null, [list.data]);

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
  const { selectMode, setSelectMode, selected, allSelected, pick, toggleAll, clear, cancel } = usePick(items.length, listKey);

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

  /* Esc는 선택을 푼다 (크게 보기·확인창이 자기 Esc를 처리하는 동안은 건드리지 않는다) */
  useEffect(() => {
    if (!selectMode || viewing !== null || confirmDelete) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectMode, viewing, confirmDelete, cancel]);

  const closeViewer = useCallback(() => setViewing(null), []);
  const count = shots?.length ?? null;
  const blocked = upload.busy || Boolean(ingest);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-pane="starlog">
      <PaneHeader title={gameName} count={count}>
        <ToolGroup label="선택">
          <ToolButton icon="select" active={selectMode} disabled={!selectMode && items.length === 0} onClick={() => (selectMode ? cancel() : setSelectMode(true))}>
            {selectMode ? "선택 취소" : "선택"}
          </ToolButton>
          {selectMode && <ToolButton icon="all" onClick={toggleAll}>{allSelected ? "전체 해제" : "전체 선택"}</ToolButton>}
          {selectMode && <ShareMenu targets={chosen.map((s) => ({ entryId, fileName: s.fileName }))} />}
          {selectMode && (
            <ToolButton icon="trash" tone="danger" disabled={selected.size === 0 || upload.busy} onClick={() => setConfirmDelete(true)}>
              삭제{selected.size ? ` (${selected.size})` : ""}
            </ToolButton>
          )}
        </ToolGroup>
        {selectMode && <span className="num text-xs text-white/50">{selected.size}개 선택</span>}
        <ToolGroup label="넣기·열기">
          <ToolButton icon="plus" disabled={blocked} onClick={() => zone.current?.querySelector<HTMLElement>("[role=button]")?.click()} title="사진·영상 고르기 (끌어다 놓거나 ⌘V도 됩니다)">
            추가
          </ToolButton>
          {getBridge() && <ToolButton icon="folder" onClick={() => void openFolder()} title="탐색기에서 이 게임의 스크린샷 폴더 열기">폴더 열기</ToolButton>}
        </ToolGroup>
      </PaneHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 xl:px-8" data-scroller>
        <div ref={zone} className="mb-4">
          <DropZone
            compact
            onFiles={upload.add}
            multiple
            video
            disabled={blocked}
            hint="이미지와 영상 · 파일을 끌어다 놓거나, 클립보드에 있으면 ⌘V"
          >
            {ingest ? (
              <IngestProgress done={ingest.done} total={ingest.total} bytesDone={ingest.bytesDone} bytesTotal={ingest.bytesTotal} />
            ) : upload.busy ? (
              <p className="text-sm text-white/60">올리는 중…</p>
            ) : undefined}
          </DropZone>
        </div>
        {(upload.error || list.error) && (
          <p role="alert" className="mb-3 text-xs text-red-400">{upload.error ?? "스크린샷을 불러오지 못했습니다."}</p>
        )}
        <UploadFailures failed={upload.failed} onClose={upload.clearFailed} />

        {list.loading && !shots ? (
          <div data-loading className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => <div key={i} className="image-placeholder aspect-video animate-pulse rounded-lg" />)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="이 게임의 스크린샷이 없습니다" hint="위 띠에 파일을 끌어다 놓거나, 클립보드에 있으면 ⌘V로 붙여 넣을 수 있습니다." action={<Button onClick={reload}>다시 읽기</Button>} />
        ) : (
          <ShotGrid
            items={items}
            selectMode={selectMode}
            selected={selected}
            onOpen={setViewing}
            onPick={(index, event) => { if (!selectMode) setSelectMode(true); pick(index, event); }}
          />
        )}
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
