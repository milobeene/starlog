"use client";

import { Collapsible } from "@/components/settings/SettingsSection";
import { useEffect, useMemo, useRef, useState } from "react";
import DropZone from "@/components/media/DropZone";
import SectionIcon from "@/components/ui/SectionIcon";
import Link from "next/link";
import { Icon, ToolButton, ToolGroup, toolClass } from "@/components/ui/ToolButton";
import { IngestProgress, UploadFailures } from "@/components/media/IngestProgress";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useShotUpload } from "@/lib/useShotUpload";
import { backendUrl } from "@/lib/apiBase";
import { usePick } from "@/lib/usePick";
import { getBridge } from "@/lib/desktop";
import { useEntryIngest } from "@/lib/ingest";
import MediaViewer from "./MediaViewer";
import MediaThumb, { PlayBadge } from "@/components/media/MediaThumb";
import ShareMenu from "@/components/media/ShareMenu";
import { onMediaChanged } from "@/lib/mediaEvents";
import { useIdlePreload, useWindowedGrid } from "@/lib/useWindowedGrid";

/**
 * 게임별 스크린샷 (v1.0 7단계, architecture §10-1).
 *
 * ## 보기와 삭제만 준다
 *
 * 캡션도 순서도 없다 (결정 41) — 주는 순간 편집 UI가 딸려오고, 그건 이 앱이 하려는 일이 아니다.
 * 그래서 **DB에 행이 없고 폴더가 곧 목록이다.** 사람이 탐색기에서 파일을 지워도
 * 다음 조회에 그대로 반영된다.
 *
 * ## 붙여넣기가 핵심이다
 *
 * 스크린샷은 찍으면 클립보드에 있다. 저장하고 → 폴더를 찾고 → 끌어오는 세 단계가
 * ⌘V 하나로 없어진다. `DropZone`이 문서 전체에서 붙여넣기를 듣는 이유가 이것
 */
type Shot = {
  fileName: string;
  url: string;
  sizeBytes: number;
  contentType: string;
  /** 원본을 찍은 시각. 이게 있어야 "넣은 순서"가 아니라 "찍은 순서"로 볼 수 있다 */
  takenAt: string | null;
  /** 저화질 썸네일. 없으면 원본으로 폴백한다 (MediaThumb) */
  thumbUrl: string | null;
  /** 흐린 자리표시 (옛 서버에는 없다) */
  placeholder?: string | null;
};

export default function ScreenshotSection({ entryId }: { entryId: number; gameName?: string }) {
  /** 펼침 상태를 여기서 든다 — 버튼이 제목 줄에 있어서 Collapsible 밖이다 */
  const [expanded, setExpanded] = useState(false);
  /** 접을 만큼 긴가. Collapsible이 실제로 재서 알려준다 — 장수로 어림하면 창 폭에 따라 틀린다 */
  const [canCollapse, setCanCollapse] = useState(false);
  /* 조회는 화면 전체가 쓰는 훅에 맡긴다 — 로딩·에러·재조회가 이미 한 벌로 들어 있다 */
  const list = useApi<Shot[]>(`/api/backlog/${entryId}/screenshots`);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /* 넣기(복사) 일의 진실은 전역 스토어다 — 화면을 떠났다 와도 버튼이 잠겨 있어야 한다 */
  const ingest = useEntryIngest(entryId);

  /*
   * **찍은 순서로 본다** (사용자 결정 2026-08-28). 서버는 파일명 순(넣은 순)으로 주는데,
   * 옛 스크린샷 여러 장을 한꺼번에 끌어다 놓으면 도착 순서가 뒤죽박죽이라 그게 안 맞는다.
   * 원본 시각이 없는 파일(옛 저장분)은 뒤로 보낸다
   */
  /*
   * ⚠️ **여기서 절대 주소로 바꾼다.** 서버는 `/api/backlog/…`처럼 상대 경로를 주는데,
   * 화면이 `app://`에서 도는 지금 그대로 쓰면 `app://starlog/api/…`가 되어 안 열린다.
   *
   * `src={shot.url}`을 쓰는 자리마다 감싸지 않고 **목록을 만드는 이 한 곳**에서 바꾼다 —
   * 자리마다 감싸면 소비처가 하나 늘 때 또 깨진다 (지금도 목록·뷰어 네 군데다)
   */
  const shots = useMemo(() => list.data
    ? [...list.data]
        .sort((a, b) => (a.takenAt ?? "9").localeCompare(b.takenAt ?? "9"))
        .map((shot) => ({ ...shot, url: backendUrl(shot.url), thumbUrl: shot.thumbUrl ? backendUrl(shot.thumbUrl) : null }))
    : null, [list.data]);

  /* 탐색기로 넣고 지운 것 — 일렉트론이 폴더 감시로 알려 준다 */
  const reload = list.reload;
  useEffect(() => onMediaChanged(reload), [reload]);

  /* 수백 장이면 보이는 줄만 그린다 (펼쳤을 때 800칸 × 노드 여럿). 나머지 썸네일은 한가할 때 미리 받는다 */
  const { attachOuter, attachGrid, start: winStart, end: winEnd, top: winTop, height: winHeight } = useWindowedGrid(shots?.length ?? 0);
  const thumbUrls = useMemo(() => shots?.map((shot) => shot.thumbUrl) ?? [], [shots]);
  useIdlePreload(thumbUrls, expanded && viewing === null);

  /*
   * 선택은 갤러리와 같은 훅이다 (선택/취소·Shift 범위·⌘ 토글). 위치로 들기 때문에
   * 목록이 실제로 바뀌면(업로드·삭제·갤러리에서 지움) 비운다. 응답 객체가 아니라 **순서대로 늘어선
   * 파일명**으로 본다 — 무관한 쓰기의 전역 무효화로 같은 목록이 다시 와도 선택이 풀리던 것
   */
  const listKey = shots?.map((shot) => shot.fileName).join("\n") ?? null;
  const { selectMode, setSelectMode, selected, allSelected, pick, toggleAll, clear, cancel } =
    usePick(shots?.length ?? 0, listKey);

  /* 일이 끝나는 순간 목록을 다시 읽는다 — 다른 화면에 있다 돌아와도 마운트 시 조회가 받는다 */
  const wasIngesting = useRef(false);
  useEffect(() => {
    if (wasIngesting.current && !ingest) reload();
    wasIngesting.current = Boolean(ingest);
  }, [ingest, reload]);

  const { add, busy, error, failed, clearFailed } = useShotUpload(entryId, list.reload);

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
    const { path } = await api.post<{ path: string }>(
      `/api/backlog/${entryId}/screenshots/folder`,
    );
    getBridge()?.openPath(path);
  };

  return (
    <section>
      <h3 className="mb-4 flex items-center justify-between gap-3 text-base font-medium text-white/90 sm:text-lg">
        <span className="flex items-center gap-2">
          <SectionIcon name="note" />
          Screenshots
        </span>
        {/* 칸을 음수 마진으로 넓히지 않는다 — 이웃 버튼 히트박스가 겹친다. 간격은 gap으로만 */}
        <span className="flex flex-wrap items-center justify-end gap-2 text-xs font-normal">
          {selectMode && <span className="num mr-1 text-white/50">{selected.size}개 선택</span>}
          {/* 고르기 계열 — 선택 모드에서만 늘어난다. 삭제만 붉다 */}
          {shots && shots.length > 0 && (
            <ToolGroup label="선택">
              <ToolButton icon="select" active={selectMode} onClick={() => (selectMode ? cancel() : setSelectMode(true))}>
                {selectMode ? "선택 취소" : "선택"}
              </ToolButton>
              {selectMode && (
                <ToolButton icon="all" onClick={toggleAll}>{allSelected ? "전체 해제" : "전체 선택"}</ToolButton>
              )}
              {selectMode && (
                <ShareMenu
                  targets={[...selected].sort((x, y) => x - y).flatMap((i) => (shots?.[i] ? [{ entryId, fileName: shots[i].fileName }] : []))}
                />
              )}
              {selectMode && (
                <ToolButton icon="trash" tone="danger" disabled={selected.size === 0 || busy} onClick={() => setConfirmDelete(true)}>
                  삭제
                </ToolButton>
              )}
            </ToolGroup>
          )}
          {/* 보기·열기 계열 — 탐색기 열기는 일렉트론에서만 뜻이 있다 (브라우저는 로컬 경로를 못 연다) */}
          <ToolGroup label="보기">
            {getBridge() && (
              <ToolButton icon="folder" onClick={openFolder} title="탐색기에서 이 게임의 스크린샷 폴더 열기">폴더 열기</ToolButton>
            )}
            {/* 0개여도 연다 — 스크린샷 화면이 빈 상태와 넣기 자리를 보여준다 */}
            <Link href={`/screenshots?entry=${entryId}`} className={toolClass()} title="스크린샷 화면에서 크게 보기">
              <Icon name="expand" />
              전체 보기
            </Link>
            {/* 펼치기가 제목 줄로 올라왔다 (v1.1.3) — 내용 아래에 있으면 수십 장일 때 손이 안 닿는다 */}
            {canCollapse && (
              <ToolButton icon={expanded ? "less" : "more"} onClick={() => setExpanded((v) => !v)}>
                {expanded ? "접기" : "펼치기"}
              </ToolButton>
            )}
          </ToolGroup>
        </span>
      </h3>

      {(error || list.error) && (
        <p className="mb-3 text-xs text-red-400">
          {error ?? "스크린샷을 불러오지 못했습니다."}
        </p>
      )}
      <UploadFailures failed={failed} onClose={clearFailed} />

      {/* 스크린샷도 접는다 (v1.2) — 수십 장이면 화면 아래가 통째로 밀린다 */}
      {shots && shots.length > 0 && (
        <Collapsible open={expanded} onOverflowChange={setCanCollapse}>
        <div ref={attachOuter} className="relative mb-4" style={winHeight === null ? undefined : { height: winHeight }}>
        <div
          ref={attachGrid}
          data-count={shots.length}
          style={{ top: winTop }}
          className={`absolute inset-x-0 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 ${selectMode ? "select-none" : ""}`}
        >
          {shots.slice(winStart, winEnd).map((shot, offset) => {
            const index = winStart + offset;
            const picked = selected.has(index);
            return (
              <div
                key={shot.fileName}
                className={`group relative aspect-video overflow-hidden rounded-lg border transition-colors ${
                  picked ? "border-white/70" : "border-white/10 hover:border-white/30"
                }`}
              >
                {/* 목록은 썸네일, 크게 보기(MediaViewer)는 원본이다. 영상은 목록에서 재생하지 않는다 */}
                <button
                  type="button"
                  onClick={(event) => (selectMode ? pick(index, event) : setViewing(index))}
                  aria-label={selectMode ? `${shot.fileName} 선택` : `${shot.fileName} 크게 보기`}
                  aria-pressed={selectMode ? picked : undefined}
                  className={`block h-full w-full ${selectMode ? "cursor-pointer" : "cursor-zoom-in"}`}
                >
                  <MediaThumb
                    thumbUrl={shot.thumbUrl}
                    url={shot.url}
                    isVideo={Boolean(shot.contentType?.startsWith("video/"))}
                    alt={shot.fileName}
                    placeholder={shot.placeholder}
                    className={picked ? "opacity-70" : ""}
                  />
                </button>
                {shot.contentType?.startsWith("video/") && <PlayBadge />}
                {/*
                  선택 모드가 아닐 때 체크는 마우스를 올렸을 때만 — 넉 장만 있어도 화면이 체크박스로
                  뒤덮인다. 눌러서 선택 모드로 들어가는 지름길이기도 하다.
                  선택 모드에서는 늘 보인다 (갤러리와 같다)
                */}
                <button
                  type="button"
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
        </Collapsible>
      )}

      <DropZone
        onFiles={add}
        multiple
        video
        disabled={busy || Boolean(ingest)}
        hint="이미지와 영상 · 파일을 끌어다 놓거나, 클립보드에 있으면 ⌘V"
      >
        {ingest ? (
          <IngestProgress done={ingest.done} total={ingest.total} bytesDone={ingest.bytesDone} bytesTotal={ingest.bytesTotal} />
        ) : busy ? (
          <p className="text-sm text-white/60">올리는 중…</p>
        ) : undefined}
      </DropZone>

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
        <MediaViewer
          items={shots}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}

    </section>
  );
}
