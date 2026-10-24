"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Dropdown from "@/components/ui/Dropdown";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import { Button, FIELD_SELECT } from "@/components/ui/Field";
import MediaThumb, { PlayBadge } from "@/components/media/MediaThumb";
import MediaViewer from "@/components/library/MediaViewer";
import { api, errorMessage, qs } from "@/lib/api";
import { backendUrl } from "@/lib/apiBase";
import { getBridge } from "@/lib/desktop";
import { applyPick } from "@/lib/pick";
import { putTask } from "@/lib/tasks";
import { invalidateQueries } from "@/lib/useApi";
import type { GalleryItem, GalleryResponse } from "@/lib/types";

type Kind = "ALL" | "IMAGE" | "VIDEO";

/** 촬영 시각은 UTC로 오고, 화면은 서울 시각으로 읽는다 */
function formatTaken(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 스크린샷 전체 화면 갤러리 (F5, 스팀의 스크린샷 관리자 같은 것).
 *
 * ## 라우트가 아니라 오버레이다
 *
 * 상세 화면에서 열고 닫으면 스크롤·입력 중이던 상태가 그대로 남아야 한다.
 * 라우트로 만들면 돌아올 때 상세를 다시 읽는다.
 *
 * ## 층 순서
 *
 * 헤더(40) < 갤러리(90) < 확인창 `Modal`(100, 갤러리 안에 그려서 같은 쌓임 맥락) < 토스트(150) < 크게 보기(200).
 * `body`로 포털을 보낸다 — 상세의 `<main>`이 `overflow-y-auto`+`z-10`이라 안에 두면 헤더 아래에 갇힌다.
 *
 * ## 선택은 "현재 목록의 위치"로 든다
 *
 * `applyPick`이 숫자 id와 순서 배열을 받아서, 위치(index)를 id로 쓴다. 필터가 바뀌거나
 * 목록이 다시 오면 위치의 뜻이 달라지므로 그때마다 선택을 비운다
 */
export default function ScreenshotGallery({
  initialEntryId,
  onClose,
}: {
  /** null이면 모든 게임 */
  initialEntryId: number | null;
  onClose: () => void;
}) {
  const [entryId, setEntryId] = useState<number | null>(initialEntryId);
  const [kind, setKind] = useState<Kind>("ALL");
  const [data, setData] = useState<GalleryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const anchor = useRef<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const media = getBridge()?.media;

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
    });
    api
      .get<GalleryResponse>(`/api/screenshots${qs({ entryId, kind })}`, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response);
        setSelected(new Set());
        anchor.current = null;
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(caught, "스크린샷을 불러오지 못했습니다."));
        setLoading(false);
      });
    return () => controller.abort();
  }, [entryId, kind, nonce]);

  const games = data?.games;
  const items = useMemo(() => data?.items ?? [], [data]);
  const order = useMemo(() => items.map((_, index) => index), [items]);

  /* 고르고 있던 게임의 파일이 전부 지워지면 드롭다운에 없는 값이 남는다 — 전체로 돌아간다 */
  useEffect(() => {
    if (entryId !== null && games && games.length > 0 && !games.some((g) => g.entryId === entryId)) {
      queueMicrotask(() => setEntryId(null));
    }
  }, [games, entryId]);

  /* 종류 알약에 붙일 개수 — 서버의 `games`가 필터와 무관한 전체라서 거기서 더한다 */
  const counts = useMemo(() => {
    const pool = (games ?? []).filter((g) => entryId === null || g.entryId === entryId);
    const image = pool.reduce((sum, g) => sum + g.imageCount, 0);
    const video = pool.reduce((sum, g) => sum + g.videoCount, 0);
    return { ALL: image + video, IMAGE: image, VIDEO: video };
  }, [games, entryId]);

  const dialogOpen = viewing !== null || confirmDelete;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // 크게 보기·확인창이 자기 Esc를 처리한다. 같은 키로 갤러리까지 닫으면 안 된다
      if (event.key === "Escape" && !dialogOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [dialogOpen, onClose]);

  const cancelSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
    anchor.current = null;
  };

  const allSelected = items.length > 0 && selected.size === items.length;

  const pick = (index: number, event: React.MouseEvent) => {
    const shift = event.shiftKey;
    const toggle = event.metaKey || event.ctrlKey;
    if (shift && anchor.current !== null && selected.has(index)) {
      /*
       * 이미 켜진 칸을 Shift로 누르면 범위를 **끈다** (사용자 요구: 범위 일괄 선택/해제).
       * `applyPick`은 켜는 쪽만 알아서 이 한 갈래만 여기서 푼다
       */
      const from = order.indexOf(anchor.current);
      const range = order.slice(Math.min(from, index), Math.max(from, index) + 1);
      setSelected((prev) => {
        const next = new Set(prev);
        range.forEach((i) => next.delete(i));
        return next;
      });
      return;
    }
    /*
     * 체크박스 화면이라 일반 클릭도 "그 칸만 토글"이다(`row: false`). Shift는 기존 선택에
     * 범위를 더한다(`toggle: true`) — 파일 관리자처럼 교체하면 앞서 고른 것이 사라진다
     */
    const result = applyPick(selected, order, anchor.current, index, {
      shift,
      toggle: shift || toggle,
      row: false,
    });
    anchor.current = result.anchor;
    setSelected(result.next);
  };

  const onTile = (index: number, event: React.MouseEvent) => {
    if (selectMode) pick(index, event);
    else setViewing(index);
  };

  const chosen = useMemo(
    () => [...selected].sort((a, b) => a - b).map((i) => items[i]).filter(Boolean),
    [selected, items],
  );

  const deleteChosen = async () => {
    /* 파일명은 게임 폴더 안에서만 유일하다 — 게임별로 묶어 한 번씩 부른다 */
    const byGame = new Map<number, string[]>();
    for (const item of chosen) {
      byGame.set(item.entryId, [...(byGame.get(item.entryId) ?? []), item.fileName]);
    }
    try {
      for (const [id, names] of byGame) {
        await api.post(`/api/backlog/${id}/screenshots/delete`, names);
      }
    } finally {
      // 중간에 실패해도 이미 지워진 것은 화면에서 빠져야 한다
      invalidateQueries();
      setNonce((n) => n + 1);
    }
  };

  const toast = (title: string, ok: boolean, message?: string) =>
    putTask({ id: "media-share", kind: "media-share", title, result: { ok, message } });

  const copyChosen = async () => {
    if (!media || chosen.length !== 1) return;
    const { entryId: id, fileName } = chosen[0];
    try {
      const result = await media.copy({ entryId: id, fileName });
      if (result.ok) {
        toast(
          result.as === "image" ? "이미지를 클립보드에 복사했습니다" : "파일을 클립보드에 복사했습니다",
          true,
          result.as === "file" ? "이미지가 아니어서 파일로 복사됐습니다. 탐색기(Finder)에 붙여넣을 수 있습니다." : undefined,
        );
      } else {
        toast(
          "복사하지 못했습니다",
          false,
          result.reason === "NOT_FOUND"
            ? "파일을 찾을 수 없습니다. 폴더에서 지워졌는지 확인해 주세요."
            : "복사할 수 없는 형식입니다. 폴더에 저장을 이용해 주세요.",
        );
      }
    } catch (caught) {
      toast("복사하지 못했습니다", false, errorMessage(caught, "잠시 후 다시 시도해 주세요."));
    }
  };

  const saveChosen = async () => {
    if (!media || chosen.length === 0) return;
    try {
      const result = await media.saveTo(chosen.map((i) => ({ entryId: i.entryId, fileName: i.fileName })));
      if (result.canceled) return;
      const failed = result.failed.length;
      toast(
        failed === 0
          ? `${result.saved.length}개를 저장했습니다`
          : `${result.saved.length}개를 저장하고 ${failed}개는 저장하지 못했습니다`,
        failed === 0,
        result.folder,
      );
    } catch (caught) {
      toast("저장하지 못했습니다", false, errorMessage(caught, "잠시 후 다시 시도해 주세요."));
    }
  };

  /* 크게 보기는 늘 원본이다. 전 게임 모드에서는 어느 게임 것인지 이름에 붙인다 */
  const viewerItems = useMemo(
    () =>
      items.map((item) => ({
        fileName: entryId === null ? `${item.gameName} · ${item.fileName}` : item.fileName,
        url: backendUrl(item.url),
        contentType: item.contentType,
      })),
    [items, entryId],
  );

  const closeViewer = useCallback(() => setViewing(null), []);

  const kinds: { value: Kind; label: string }[] = [
    { value: "ALL", label: "모든 미디어" },
    { value: "IMAGE", label: "스크린샷" },
    { value: "VIDEO", label: "영상" },
  ];

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="스크린샷 갤러리"
      className="fixed inset-0 z-[90] flex flex-col bg-neutral-950/80 backdrop-blur-xl"
    >
      {/* 위: 필터. 폰 폭에서는 줄이 바뀐다 */}
      <div className="page-x flex shrink-0 flex-col gap-3 border-b border-white/10 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <h2 className="shrink-0 text-sm font-semibold tracking-wide text-white/90 uppercase">
            Screenshots
          </h2>
          <select
            aria-label="게임"
            value={entryId ?? ""}
            onChange={(event) => setEntryId(event.target.value === "" ? null : Number(event.target.value))}
            className={`${FIELD_SELECT} min-w-0 flex-1 sm:max-w-xs sm:flex-none`}
          >
            <option value="">모든 게임</option>
            {(games ?? []).map((game) => (
              <option key={game.entryId} value={game.entryId}>
                {game.gameName} ({game.imageCount + game.videoCount})
              </option>
            ))}
          </select>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="ml-auto shrink-0 px-1 text-2xl leading-none text-white/50 transition-colors hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="미디어 종류">
            {kinds.map((option) => (
              <button
                key={option.value}
                onClick={() => setKind(option.value)}
                aria-pressed={kind === option.value}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  kind === option.value
                    ? "border-white/40 bg-white/15 text-white"
                    : "border-white/10 text-white/50 hover:border-white/25 hover:text-white"
                }`}
              >
                {option.label} <span className="num text-white/40">{counts[option.value]}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selectMode && (
              <span className="num mr-1 text-xs text-white/50">{selected.size}개 선택</span>
            )}
            {selectMode && (
              <Button
                disabled={items.length === 0}
                onClick={() => {
                  setSelected(allSelected ? new Set() : new Set(order));
                  anchor.current = null;
                }}
              >
                {allSelected ? "전체 선택 해제" : "전체 선택"}
              </Button>
            )}
            {/* 공유는 일렉트론에서만 — 브라우저는 로컬 파일 접근과 폴더 선택이 없다 */}
            {media && (
              <Dropdown
                align="right"
                panelClassName="w-64"
                trigger={() => (
                  <span
                    aria-disabled={selected.size === 0}
                    className={`block rounded-md border border-white/15 px-3 py-2 text-xs font-medium tracking-widest whitespace-nowrap text-white/80 uppercase transition-all hover:bg-white/10 hover:text-white sm:px-4 ${
                      selected.size === 0 ? "pointer-events-none opacity-40" : ""
                    }`}
                  >
                    공유
                  </span>
                )}
              >
                {(close) => (
                  <>
                    <button
                      className="menu-item flex-col !items-start !gap-0 disabled:pointer-events-none disabled:opacity-40"
                      disabled={chosen.length !== 1}
                      onClick={() => {
                        close();
                        void copyChosen();
                      }}
                    >
                      클립보드 복사
                      <span className="text-[11px] text-white/35">한 개만 선택했을 때 사용할 수 있습니다</span>
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => {
                        close();
                        void saveChosen();
                      }}
                    >
                      폴더에 저장…
                    </button>
                  </>
                )}
              </Dropdown>
            )}
            <Button variant="danger" disabled={selected.size === 0} onClick={() => setConfirmDelete(true)}>
              삭제
            </Button>
            <Button
              disabled={!selectMode && items.length === 0}
              onClick={() => (selectMode ? cancelSelect() : setSelectMode(true))}
            >
              {selectMode ? "취소" : "선택"}
            </Button>
          </div>
        </div>
      </div>

      {/* 본문. 스크롤은 여기서만 — 위 필터는 고정 */}
      <div className="page-x min-h-0 flex-1 overflow-y-auto py-4 select-none">
        {error ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Button onClick={() => setNonce((n) => n + 1)}>다시 시도</Button>
          </div>
        ) : loading && !data ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="image-placeholder aspect-video animate-pulse rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={kind === "ALL" ? "스크린샷이 없습니다" : "이 종류의 미디어가 없습니다"}
            hint="게임 상세 화면에서 이미지와 영상을 올릴 수 있습니다."
          />
        ) : (
          <div
            className={`grid grid-cols-2 gap-2 transition-opacity sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 ${
              loading ? "opacity-50" : ""
            }`}
          >
            {items.map((item, index) => (
              <Tile
                key={`${item.entryId}/${item.fileName}`}
                item={item}
                showGame={entryId === null}
                selectMode={selectMode}
                picked={selected.has(index)}
                onClick={(event) => onTile(index, event)}
              />
            ))}
          </div>
        )}
      </div>

      {viewing !== null && (
        <MediaViewer items={viewerItems} index={viewing} onIndex={setViewing} onClose={closeViewer} />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="삭제"
          message={`선택한 ${selected.size}개를 삭제합니다. 썸네일도 함께 지워지며 되돌릴 수 없습니다.`}
          confirmLabel={`${selected.size}개 삭제`}
          onConfirm={deleteChosen}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>,
    document.body,
  );
}

function Tile({
  item,
  showGame,
  selectMode,
  picked,
  onClick,
}: {
  item: GalleryItem;
  showGame: boolean;
  selectMode: boolean;
  picked: boolean;
  onClick: (event: React.MouseEvent) => void;
}) {
  const isVideo = item.kind === "VIDEO";
  const date = formatTaken(item.takenAt);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${item.gameName} ${item.fileName}`}
      aria-pressed={selectMode ? picked : undefined}
      className={`group relative aspect-video overflow-hidden rounded-lg border text-left transition-colors ${
        picked ? "border-white/80" : "border-white/10 hover:border-white/30"
      } ${selectMode ? "cursor-pointer" : "cursor-zoom-in"}`}
    >
      <MediaThumb
        thumbUrl={item.thumbUrl}
        url={item.url}
        isVideo={isVideo}
        alt={item.fileName}
        className={picked ? "opacity-70" : ""}
      />
      {isVideo && <PlayBadge />}

      {/* 게임 이름·날짜는 아래 띠에 — 틀은 안 움직이고 안쪽만 보인다 (디자인 시스템 호버 규칙) */}
      {(showGame || date) && (
        <span
          className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 text-[11px] transition-opacity ${
            showGame ? "" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {showGame && <span className="min-w-0 truncate text-white/80">{item.gameName}</span>}
          <span className="num ml-auto shrink-0 text-white/50">{date}</span>
        </span>
      )}

      {selectMode && (
        <span
          aria-hidden
          className={`absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded border text-[11px] ${
            picked ? "border-white bg-white text-black" : "border-white/70 bg-black/40 text-transparent"
          }`}
        >
          ✓
        </span>
      )}
    </button>
  );
}
