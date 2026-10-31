"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Field";
import Modal from "@/components/ui/Modal";
import { ToolButton, ToolGroup } from "@/components/ui/ToolButton";
import MediaViewer from "@/components/library/MediaViewer";
import GamePicker from "@/components/inbox/GamePicker";
import { bridgeMessage, getBridge, type ExternalSource, type InboxGroup, type InboxScan } from "@/lib/desktop";
import { invalidateQueries } from "@/lib/useApi";
import { usePick } from "@/lib/usePick";
import { useIdlePreload } from "@/lib/useWindowedGrid";
import { STEAM_NOTE } from "@/lib/ingest";
import type { SteamLink } from "@/lib/types";
import PaneHeader from "./PaneHeader";
import { SelectActions, SelectionCount, SelectToggle } from "./SelectBar";
import { useShotShortcuts } from "@/lib/useShotShortcuts";
import { Skeleton } from "@/components/ui/Skeleton";
import ShotGrid, { type GridItem } from "./ShotGrid";

/**
 * 외부 폴더 한 묶음 — 보기와 **옮기기**(고른 사진을 게임으로, 원본은 휴지통).
 * 선택은 묶음 하나 안에서만 한다 — 묶음을 바꾸면 비운다. 스팀 묶음은 appid 하나라 "이 게임 사진을 어느 게임으로"가
 * 한 번에 정해지고, 지난번 고른 게임을 기억해 두었다가 맨 위에 올려 준다
 */
export default function ExternalPane({
  source,
  group,
  scan,
  loading,
  error,
  onRetry,
  onMoved,
  onDrop,
  link,
  onLink,
  showMoved,
  onShowMoved,
}: {
  source: ExternalSource;
  group: InboxGroup | null;
  scan: InboxScan | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** 옮기기가 끝났다 (성공이든 되돌림이든) — 목록을 다시 읽는다 */
  onMoved: () => void;
  /** 성공한 장을 목록에서 바로 뺀다 */
  onDrop: (rels: Set<string>) => void;
  /** 스팀 묶음에 연결된 게임 (없으면 null) */
  link: SteamLink | null;
  /** 사용자가 고른 게임으로 직접 연결 */
  onLink: (appid: string, entryId: number, name: string) => void;
  /** 이미 STARLOG로 복사해 간 스팀 사진을 보일지 */
  showMoved: boolean;
  onShowMoved: (v: boolean) => void;
}) {
  const sourcesApi = getBridge()?.sources;
  const [viewing, setViewing] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [moving, setMoving] = useState<{ batchId: string; rels: Set<string> } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const steam = source.kind === "steam";
  const movedCount = useMemo(() => (group?.items ?? []).filter((it) => it.moved).length, [group]);
  /* 이미 가져간 스팀 사진은 기본으로 숨긴다 — 켜면 흐리게 + "옮김" 배지로 보인다 */
  const rawItems = useMemo(() => (group?.items ?? []).filter((it) => showMoved || !it.moved), [group, showMoved]);
  const items: GridItem[] = useMemo(
    () => rawItems.map((it) => ({
      key: it.rel, name: it.name, url: it.url, thumbUrl: it.thumbUrl, contentType: it.contentType,
      placeholder: it.placeholder, takenMs: it.takenAtMs, busy: moving?.rels.has(it.rel) ?? false, badge: it.moved ? "옮김" : undefined,
    })),
    [rawItems, moving],
  );

  const { selectMode, setSelectMode, selected, allSelected, pick, toggleAll, selectAll, cancel } =
    usePick(items.length, `${source.id}/${group?.key}/${items.length}`);
  const chosen = useMemo(
    () => [...selected].sort((a, b) => a - b).map((i) => rawItems[i]).filter((it) => Boolean(it) && !it.moved && !moving?.rels.has(it.rel)),
    [selected, rawItems, moving],
  );

  /* 옮기기 진행 — 끝나면(성공이든 되돌림이든) 목록을 다시 읽어 옮겨진 장이 빠지게 한다 */
  useEffect(() => {
    const media = getBridge()?.media;
    if (!moving || !media?.onIngest) return;
    const finish = (job: { batchId: string; phase: string }) => {
      if (job.batchId !== moving.batchId) return;
      if (job.phase === "done" || job.phase === "failed" || job.phase === "rolledBack") {
        // 폴더 종류는 원본이 휴지통으로 가서 목록에서 바로 뺀다. 스팀은 그대로 두고 "옮김"으로 표시된다 (다시 읽기)
        if (job.phase === "done" && !steam) onDrop(moving.rels);
        setMoving(null);
        onMoved();
        invalidateQueries();
      }
    };
    const off = media.onIngest(finish);
    // 작은 묶음은 구독이 붙기 전에 끝날 수 있다 — 메인에 남은 상태를 한 번 본다
    void media.ingestStatus?.().then((all) => all.forEach(finish)).catch(() => {});
    return off;
  }, [moving, onDrop, onMoved, steam]);

  const thumbUrls = useMemo(() => rawItems.map((it) => it.thumbUrl), [rawItems]);
  useIdlePreload(thumbUrls, viewing === null && !picking);

  const viewerItems = useMemo(
    () => rawItems.map((it) => ({ fileName: it.name, url: it.url, contentType: it.contentType, thumbUrl: it.thumbUrl })),
    [rawItems],
  );
  const closeViewer = useCallback(() => setViewing(null), []);

  useShotShortcuts({
    enabled: viewing === null && !picking && !confirming,
    selectMode,
    selectedCount: selected.size,
    itemCount: items.length,
    onToggleMode: () => setSelectMode(true),
    onSelectAll: selectAll,
    onCancel: cancel,
  });

  const startMove = async (entryId: number, name: string | null) => {
    if (!sourcesApi || !group) return;
    setPicking(false);
    setConfirming(false);
    // 스팀 묶음에서 다른 게임을 골랐다 → 그 선택이 새 연결(직접)이 된다
    if (steam && name !== null && link?.entryId !== entryId) onLink(group.key, entryId, name);
    setMoveError(null);
    try {
      const rels = chosen.map((c) => c.rel);
      const { batchId } = await sourcesApi.move({ sourceId: source.id, groupKey: group.key, rels, entryId });
      setMoving({ batchId, rels: new Set(rels) });
      cancel();
    } catch (caught) {
      setMoveError(bridgeMessage(caught, "옮기지 못했습니다."));
    }
  };

  const reveal = () => {
    if (!group) return;
    void sourcesApi?.reveal?.(source.id, group.key).catch((caught: unknown) => setMoveError(bridgeMessage(caught, "폴더를 열지 못했습니다.")));
  };

  const pinnedId = steam ? link?.entryId ?? null : null;
  /* 연결된 게임이 있으면 고르기 창 대신 확인 한 번 — [다른 게임 고르기]로 바꿀 수 있다 */
  const beginMove = () => { if (steam && link?.entryId != null) setConfirming(true); else setPicking(true); };
  /* 제목은 그 묶음의 이름 하나 — 폴더 이름까지 앞에 붙이면 길어져 도구 줄이 아래로 밀린다. 폴더 이름은 작은 글씨로 */
  const multi = Boolean(group && scan && scan.groups.length > 1);
  const title = multi && group ? group.title : source.name;
  const subText = multi ? [source.name, group?.sub].filter(Boolean).join(" · ") : group?.sub ?? null;

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" data-pane="external" data-scroller>
      {/* 여백은 안쪽 상자가 가진다 — 스크롤러 패딩은 sticky의 기준을 밀어 낸다 */}
      <div className="page-x pt-[4.5rem] pb-10 lg:pt-20">
      <PaneHeader
        title={title}
        sub={subText}
        count={group ? items.length : null}
        note={steam && link?.entryId != null ? `→ ${link.entryName ?? "연결된 게임"}` : null}
        left={selectMode ? <SelectionCount count={selected.size} /> : null}
      >
        {group && (
          <>
            {steam && movedCount > 0 && (
              <ToolGroup label="보기">
                <ToolButton active={showMoved} onClick={() => onShowMoved(!showMoved)} data-show-moved>
                  {showMoved ? "옮긴 것 숨기기" : `옮긴 것도 보기 (${movedCount})`}
                </ToolButton>
              </ToolGroup>
            )}
            {sourcesApi?.reveal && (
              <ToolGroup label="열기">
                <ToolButton icon="folder" onClick={reveal} title="탐색기에서 이 폴더 열기">폴더 열기</ToolButton>
              </ToolGroup>
            )}
            <ToolGroup label="옮기기">
              <ToolButton icon="move" tone="primary" data-move disabled={chosen.length === 0 || moving !== null} onClick={beginMove}>
                {moving ? (steam ? "복사하는 중…" : "옮기는 중…") : `${steam ? "게임으로 복사" : "게임으로 옮기기"}${selected.size ? ` (${selected.size})` : ""}`}
              </ToolButton>
            </ToolGroup>
            {selectMode && <SelectActions allSelected={allSelected} onToggleAll={toggleAll} />}
            <SelectToggle selectMode={selectMode} disabled={!selectMode && items.length === 0} onClick={() => (selectMode ? cancel() : setSelectMode(true))} />
          </>
        )}
      </PaneHeader>

      <div className="mt-4">
        {moveError && <p role="alert" className="mb-3 text-xs text-red-400">{moveError}</p>}
        {scan?.truncated && <p className="mb-3 text-xs text-white/50">목록이 너무 많아 일부만 표시합니다.</p>}
        {error ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Button onClick={onRetry}>다시 시도</Button>
          </div>
        ) : loading ? (
          <div data-loading className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-video w-full rounded-lg" />)}
          </div>
        ) : !group ? (
          <EmptyState title="사진이 없습니다" hint="이 폴더에서 사진이나 영상을 찾지 못했습니다." />
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

      </div>
      {viewing !== null && viewerItems[viewing] && (
        <MediaViewer items={viewerItems} index={viewing} onIndex={setViewing} onClose={closeViewer} />
      )}
      {confirming && link?.entryId != null && (
        <Modal
          title={`${chosen.length}장을 복사합니다`}
          onClose={() => setConfirming(false)}
          width="max-w-md"
          footer={
            <>
              <Button onClick={() => { setConfirming(false); setPicking(true); }} data-pick-other>다른 게임 고르기</Button>
              <Button variant="primary" onClick={() => void startMove(link.entryId!, null)} data-confirm-move>
                복사
              </Button>
            </>
          }
        >
          <p className="text-sm text-white/80">
            <span className="text-white">{link.entryName ?? "연결된 게임"}</span>
            <span className="ml-2 text-[11px] text-white/40">{link.source === "AUTO" ? "자동 연결" : "직접 연결"}</span>
          </p>
          <p className="mt-2 text-xs text-white/45">{STEAM_NOTE}</p>
        </Modal>
      )}
      {picking && (
        <GamePicker
          pinnedId={pinnedId}
          count={chosen.length}
          steam={steam}
          onPick={(entryId, name) => void startMove(entryId, name)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
