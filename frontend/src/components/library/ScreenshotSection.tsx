"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AddTile from "@/components/media/AddTile";
import { useFileDrop } from "@/lib/useFileDrop";
import { useShotShortcuts } from "@/lib/useShotShortcuts";
import { newestFirst, type Shot } from "@/lib/shots";
import { SelectActions, SelectionCount, SelectToggle } from "@/components/screenshots/SelectBar";
import { Skeleton } from "@/components/ui/Skeleton";
import SectionIcon from "@/components/ui/SectionIcon";
import Link from "next/link";
import { Icon, ToolButton, ToolGroup, toolClass } from "@/components/ui/ToolButton";
import { UploadFailures } from "@/components/media/IngestProgress";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useShotUpload } from "@/lib/useShotUpload";
import { usePick } from "@/lib/usePick";
import { getBridge } from "@/lib/desktop";
import { useEntryIngest } from "@/lib/ingest";
import MediaViewer from "./MediaViewer";
import MediaThumb, { PlayBadge } from "@/components/media/MediaThumb";
import { onMediaChanged } from "@/lib/mediaEvents";
import { useIdlePreload, useWindowedGrid } from "@/lib/useWindowedGrid";

/**
 * 게임별 스크린샷 (v1.0 7단계, architecture §10-1).
 *
 * 보기와 삭제만 준다 — 캡션도 순서도 없다 (결정 41). **DB에 행이 없고 폴더가 곧 목록이다.**
 * 붙여넣기가 핵심이다: 스크린샷은 찍으면 클립보드에 있어 ⌘V 하나로 저장·폴더 찾기·끌어오기가 없어진다 (`useFileDrop`이 문서 전체에서 듣는다)
 */
export default function ScreenshotSection({ entryId }: { entryId: number; gameName?: string }) {
  /** 접힘이 기본이다 — 수십 장이면 상세 아래가 통째로 밀린다 */
  const [expanded, setExpanded] = useState(false);
  /* 조회는 화면 전체가 쓰는 훅에 맡긴다 — 로딩·에러·재조회가 이미 한 벌로 들어 있다 */
  const list = useApi<Shot[]>(`/api/backlog/${entryId}/screenshots`);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /* 넣기(복사) 일의 진실은 전역 스토어다 — 화면을 떠났다 와도 카드가 잠겨 있어야 한다 */
  const ingest = useEntryIngest(entryId);

  /* 최신이 앞 — 스크린샷 화면과 같은 순서 (`newestFirst`가 절대 주소로 바꾸는 한 곳이기도 하다) */
  const shots = useMemo(() => (list.data ? newestFirst(list.data) : null), [list.data]);

  /* 탐색기로 넣고 지운 것 — 일렉트론이 폴더 감시로 알려 준다 */
  const reload = list.reload;
  useEffect(() => onMediaChanged(reload), [reload]);

  /* 첫 칸이 추가 카드라 한 칸을 더 센다 */
  const cells = (shots?.length ?? 0) + 1;
  const { attachOuter, attachGrid, start: winStart, end: winEnd, top: winTop, height: winHeight, rowH, rowGap } = useWindowedGrid(cells);
  const thumbUrls = useMemo(() => shots?.map((shot) => shot.thumbUrl) ?? [], [shots]);
  useIdlePreload(thumbUrls, expanded && viewing === null);

  /*
   * 선택은 갤러리와 같은 훅이다. 위치로 들기 때문에 목록이 실제로 바뀌면 비운다. 응답 객체가 아니라 **순서대로 늘어선
   * 파일명**으로 본다 — 무관한 쓰기의 전역 무효화로 같은 목록이 다시 와도 선택이 풀리던 것
   */
  const listKey = shots?.map((shot) => shot.fileName).join("\n") ?? null;
  const { selectMode, setSelectMode, selected, allSelected, pick, toggleAll, selectAll, clear, cancel } =
    usePick(shots?.length ?? 0, listKey);

  /* 일이 끝나는 순간 목록을 다시 읽는다 — 다른 화면에 있다 돌아와도 마운트 시 조회가 받는다 */
  const wasIngesting = useRef(false);
  useEffect(() => {
    if (wasIngesting.current && !ingest) reload();
    wasIngesting.current = Boolean(ingest);
  }, [ingest, reload]);

  const { add, busy, error, failed, clearFailed } = useShotUpload(entryId, list.reload);
  const blocked = busy || Boolean(ingest);
  const zone = useRef<HTMLDivElement>(null);
  const drop = useFileDrop({ onFiles: add, disabled: blocked, zone });

  useShotShortcuts({
    enabled: viewing === null && !confirmDelete,
    selectMode,
    selectedCount: selected.size,
    itemCount: shots?.length ?? 0,
    onToggleMode: () => setSelectMode(true),
    onSelectAll: selectAll,
    onCancel: cancel,
    onDelete: () => setConfirmDelete(true),
  });

  const removeSelected = async () => {
    // ConfirmDialog가 실패를 받아 보여주도록 던진다
    const names = [...selected].sort((x, y) => x - y).map((i) => shots?.[i]?.fileName).filter(Boolean);
    try {
      await api.post(`/api/backlog/${entryId}/screenshots/delete`, names);
    } finally {
      clear();
      list.reload();
    }
  };

  const openFolder = async () => {
    const { path } = await api.post<{ path: string }>(`/api/backlog/${entryId}/screenshots/folder`);
    getBridge()?.openPath(path);
  };

  /* 접힌 높이 = 두 줄 + 셋째 줄의 절반 (잘린 줄이 보여야 "더 있다"가 읽힌다). 줄 높이는 재야 알아서 그 전엔 접지 않는다 */
  const collapsedH = rowH === null ? null : rowH * 2 + (rowH - rowGap) / 2;
  const canCollapse = collapsedH !== null && winHeight !== null && winHeight > collapsedH + 8;
  const collapsed = canCollapse && !expanded;

  /*
   * 제목 줄의 버튼이 화면 위로 스크롤돼 나가면 같은 줄을 구역 오른쪽 위에 붙여 둔다 (sticky) —
   * 긴 구역에서 [선택]·[접기]를 누르려고 위로 되돌아가지 않게. 상세는 `<main>`이 스크롤하므로 뷰포트 교차로 본다
   */
  const headRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    /* IntersectionObserver는 화면을 안 그리는 창에서 콜백이 늦어 스크롤 이벤트로 직접 잰다 — 줄 하나의 rect라 싸다 */
    const read = () => setPinned(el.getBoundingClientRect().bottom < 76);
    read();
    document.addEventListener("scroll", read, { capture: true, passive: true });
    window.addEventListener("resize", read);
    return () => {
      document.removeEventListener("scroll", read, { capture: true });
      window.removeEventListener("resize", read);
    };
  }, []);

  const empty = (shots?.length ?? 0) === 0;
  const buttons = (
    <>
      <ToolGroup label="보기">
        {/* 탐색기 열기는 일렉트론에서만 뜻이 있다 (브라우저는 로컬 경로를 못 연다) */}
        {getBridge() && <ToolButton icon="folder" short onClick={openFolder} title="탐색기에서 이 게임의 스크린샷 폴더 열기">폴더 열기</ToolButton>}
        {/* 0개여도 연다 — 스크린샷 화면이 빈 상태와 넣기 자리를 보여준다 */}
        <Link href={`/screenshots?entry=${entryId}`} className={toolClass()} title="스크린샷 화면에서 크게 보기">
          <Icon name="expand" />
          <span className="max-sm:sr-only">전체 보기</span>
        </Link>
        {canCollapse && (
          <ToolButton icon={expanded ? "less" : "more"} short title={expanded ? "접기" : "펼치기"} onClick={() => setExpanded((v) => !v)} data-expand-toggle>
            {expanded ? "접기" : "펼치기"}
          </ToolButton>
        )}
      </ToolGroup>
      {selectMode && (
        <SelectActions
          allSelected={allSelected}
          onToggleAll={toggleAll}
          shareTargets={[...selected].sort((x, y) => x - y).flatMap((i) => (shots?.[i] ? [{ entryId, fileName: shots[i].fileName }] : []))}
          deleteCount={selected.size}
          deleteDisabled={busy}
          onDelete={() => setConfirmDelete(true)}
        />
      )}
      <SelectToggle selectMode={selectMode} disabled={!selectMode && empty} onClick={() => (selectMode ? cancel() : setSelectMode(true))} />
    </>
  );

  return (
    <section data-shot-section>
      <div ref={headRef} className="mb-4 flex scroll-mt-24 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className="flex items-center gap-3 text-base font-medium text-white/90 sm:text-lg">
          <span className="flex items-center gap-2">
            <SectionIcon name="note" />
            Screenshots
          </span>
          {selectMode && <SelectionCount count={selected.size} />}
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-normal">{buttons}</div>
      </div>

      {pinned && (
        <div className="sticky top-[4.75rem] z-20 h-0" data-sticky-bar>
          <div className="glass-panel absolute top-0 right-0 flex max-w-full flex-wrap items-center justify-end gap-2 rounded-xl p-1.5">
            <ToolButton
              icon="up"
              onClick={() => headRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })}
              title="구역 맨 위로"
              data-scroll-top
            >
              위로
            </ToolButton>
            {buttons}
          </div>
        </div>
      )}

      {(error || list.error || drop.rejected) && (
        <p role="alert" className="mb-3 text-xs text-red-400">{error ?? (list.error ? "스크린샷을 불러오지 못했습니다." : drop.rejected)}</p>
      )}
      <UploadFailures failed={failed} onClose={clearFailed} />

      <div ref={zone} {...drop.handlers}>
        {list.loading && !shots ? (
          <div data-loading className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-video w-full rounded-lg" />)}
          </div>
        ) : (
          <div
            className="relative"
            style={collapsed && collapsedH !== null ? { maxHeight: collapsedH, overflow: "hidden", maskImage: "linear-gradient(to bottom, black calc(100% - 3.5rem), transparent)", WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 3.5rem), transparent)" } : undefined}
            data-collapsed={collapsed || undefined}
          >
            <div ref={attachOuter} className="relative" style={winHeight === null ? undefined : { height: winHeight }}>
              <div
                ref={attachGrid}
                data-count={cells}
                style={{ top: winTop }}
                className={`absolute inset-x-0 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 ${selectMode ? "select-none" : ""}`}
              >
                {winStart === 0 && <AddTile onFiles={add} over={drop.over} disabled={blocked} uploading={busy} ingest={ingest} />}
                {(shots ?? []).slice(Math.max(0, winStart - 1), Math.max(0, winEnd - 1)).map((shot, offset) => {
                  const index = Math.max(0, winStart - 1) + offset;
                  const picked = selected.has(index);
                  const isVideo = Boolean(shot.contentType?.startsWith("video/"));
                  return (
                    <div
                      key={shot.fileName}
                      data-tile
                      className={`group relative aspect-video overflow-hidden rounded-lg border transition-colors ${
                        picked ? "border-white/80" : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      {/* 목록은 썸네일, 크게 보기(MediaViewer)는 원본이다. 영상은 목록에서 재생하지 않는다 */}
                      <button
                        type="button"
                        onClick={(event) => (selectMode ? pick(index, event) : setViewing(index))}
                        aria-label={selectMode ? `${shot.fileName} 선택` : `${shot.fileName} 크게 보기`}
                        aria-pressed={selectMode ? picked : undefined}
                        className={`block h-full w-full focus-visible:ring-1 focus-visible:ring-white/60 focus-visible:outline-none focus-visible:ring-inset ${selectMode ? "cursor-pointer" : "cursor-zoom-in"}`}
                      >
                        <MediaThumb thumbUrl={shot.thumbUrl} url={shot.url} isVideo={isVideo} alt={shot.fileName} placeholder={shot.placeholder} className={picked ? "opacity-70" : ""} />
                      </button>
                      {isVideo && <PlayBadge />}
                      {/* 선택 모드가 아닐 때 체크는 마우스를 올렸을 때만 — 눌러서 선택 모드로 들어가는 지름길이기도 하다 */}
                      <button
                        type="button"
                        data-check
                        onClick={(event) => {
                          setSelectMode(true);
                          pick(index, event);
                        }}
                        aria-label={`${shot.fileName} 선택`}
                        className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded border text-[10px] transition-opacity ${
                          picked
                            ? "border-white bg-white text-black opacity-100"
                            : selectMode
                              ? "border-white/70 bg-black/40 text-transparent opacity-100"
                              : "border-white/60 bg-black/40 text-transparent opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        ✓
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="relative -mt-9 flex justify-center">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-full border border-white/15 bg-black/50 px-3.5 py-1 text-[11px] text-white/70 backdrop-blur-md transition-colors hover:border-white/40 hover:text-white"
            >
              <span className="num">{shots?.length ?? 0}</span>장 모두 펼치기
            </button>
          </div>
        )}
        {empty && !list.loading && <p className="mt-3 text-xs text-white/30" data-empty>아직 이 게임의 스크린샷이 없습니다.</p>}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="삭제"
          message={`선택한 ${selected.size}개를 삭제합니다. 썸네일도 함께 지워지며 되돌릴 수 없습니다.`}
          confirmLabel={`${selected.size}개 삭제`}
          onConfirm={removeSelected}
          onClose={() => setConfirmDelete(false)}
        />
      )}

      {viewing !== null && shots && (
        <MediaViewer items={shots} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
    </section>
  );
}
