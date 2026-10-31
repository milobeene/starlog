"use client";

import MediaThumb, { PlayBadge } from "@/components/media/MediaThumb";
import { kstDate } from "@/lib/format";
import { useWindowedGrid } from "@/lib/useWindowedGrid";

/** STARLOG 안 사진과 외부 폴더 사진이 같이 쓰는 칸 모양 */
export interface GridItem {
  key: string;
  name: string;
  url: string;
  thumbUrl: string | null;
  contentType: string;
  placeholder?: string | null;
  takenMs: number | null;
  /** 옮기는 중이라 고를 수 없는 칸 */
  busy?: boolean;
  /** 흐리게 + 모서리 배지 (스팀에서 이미 복사해 간 사진) */
  badge?: string;
}

/**
 * 스크린샷 화면의 큰 격자 — **보이는 줄만 그린다** (`useWindowedGrid`). 선택 상태는 부모가 든다.
 * 선택 모드가 아닐 때 체크는 마우스를 올렸을 때만 보인다 (눌러서 선택 모드로 들어가는 지름길)
 */
export default function ShotGrid({
  items,
  selectMode,
  selected,
  onOpen,
  onPick,
  lead,
  columns = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6",
}: {
  items: GridItem[];
  selectMode: boolean;
  selected: Set<number>;
  onOpen: (index: number) => void;
  /** 체크 눌림·선택 모드에서의 칸 눌림 */
  onPick: (index: number, event: React.MouseEvent) => void;
  /** 첫 칸에 끼울 것 (추가 카드) — 사진과 같은 칸 크기라 창 계산에 한 칸으로 센다 */
  lead?: React.ReactNode;
  columns?: string;
}) {
  const shift = lead ? 1 : 0;
  const { attachOuter, attachGrid, start, end, top, height } = useWindowedGrid(items.length + shift);
  return (
    <div ref={attachOuter} className={`relative ${selectMode ? "select-none" : ""}`} style={height === null ? undefined : { height }}>
      <div
        ref={attachGrid}
        data-count={items.length}
        className={`absolute inset-x-0 grid gap-2 ${columns}`}
        style={{ top }}
      >
        {lead && start === 0 && lead}
        {items.slice(Math.max(0, start - shift), Math.max(0, end - shift)).map((item, offset) => {
          const index = Math.max(0, start - shift) + offset;
          const picked = selected.has(index);
          const isVideo = item.contentType.startsWith("video/");
          return (
            <div
              key={item.key}
              data-tile
              className={`group relative aspect-video overflow-hidden rounded-lg border transition-colors ${item.busy ? "pointer-events-none opacity-40" : item.badge ? "opacity-50 hover:opacity-90" : ""} ${
                picked ? "border-white/80" : "border-white/10 hover:border-white/30"
              }`}
            >
              <button
                type="button"
                onClick={(event) => (selectMode ? onPick(index, event) : onOpen(index))}
                aria-label={selectMode ? `${item.name} 선택` : `${item.name} 크게 보기`}
                aria-pressed={selectMode ? picked : undefined}
                className={`block h-full w-full ${selectMode ? "cursor-pointer" : "cursor-zoom-in"}`}
              >
                <MediaThumb
                  thumbUrl={item.thumbUrl}
                  url={item.url}
                  isVideo={isVideo}
                  alt={item.name}
                  placeholder={item.placeholder}
                  className={picked ? "opacity-70" : ""}
                />
              </button>
              {isVideo && <PlayBadge />}
              {item.badge && (
                <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/80">{item.badge}</span>
              )}
              {item.takenMs !== null && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 text-[11px] opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="num text-white/60">{kstDate(new Date(item.takenMs))}</span>
                </span>
              )}
              <button
                type="button"
                data-check
                onClick={(event) => onPick(index, event)}
                aria-label={`${item.name} 선택`}
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
  );
}
