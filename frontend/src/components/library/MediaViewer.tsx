"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 스크린샷·영상 크게 보기 (2026-08-28에 다시 만듦).
 *
 * ## 🐛 예전에 무엇이 잘못됐나
 *
 * - 사진을 누르면 **닫혔다** — 보려고 연 걸 보려다 닫는다
 * - 배경이 그냥 검정이라 뒤가 통째로 사라졌다
 * - ⚠️ **헤더와 사이드바 위로 안 올라갔다.** 그 둘만 시커멓게 눌리고 **클릭도 됐다** —
 *   `z-[110]`을 줬지만 헤더가 `mix-blend-difference`로 자기 쌓임 맥락을 만들어서,
 *   같은 맥락 안이 아니면 z-index 비교 자체가 성립하지 않는다
 *
 * → **포털로 `<body>` 바로 아래에 붙인다.** 그러면 어떤 쌓임 맥락에도 안 갇힌다.
 *
 * ## 배경은 옅게 + 블러
 *
 * 완전히 까맣게 덮으면 "어디서 열었는지"가 사라진다. 살짝 어둡게 하고 블러를 넣으면
 * 뒤가 남아 있는 채로 앞이 또렷해진다 — 모달이 이미 쓰는 방식이다
 */
export type MediaItem = {
  fileName: string;
  url: string;
  contentType: string;
  /** 이미 그리드가 받아 둔 썸네일 — 원본이 풀리기 전까지 같은 자리에 먼저 보인다 */
  thumbUrl?: string | null;
};

/** 키를 누르고 있을 때(반복) 넘기는 최소 간격. 첫 누름은 바로 넘어간다 */
export const HOLD_STEP_MS = 120;
/** 이만큼 넘김이 없으면 "멈췄다"로 보고 원본을 불러온다 */
const SETTLE_MS = 150;
/** 미리 풀어 둘 이웃 수 (진행 방향) */
const PREFETCH_AHEAD = 3;
/** 풀어 둔 원본을 들고 있는 개수. DOM 밖(new Image)이라 GPU가 아니라 메모리에 남는다 */
const DECODED_MAX = 24;
const decoded = new Map<string, HTMLImageElement>();

function prefetch(url: string) {
  const hit = decoded.get(url);
  if (hit) { decoded.delete(url); decoded.set(url, hit); return; }
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  image.decode().catch(() => decoded.delete(url));
  decoded.set(url, image);
  while (decoded.size > DECODED_MAX) decoded.delete(decoded.keys().next().value!);
}

export default function MediaViewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: MediaItem[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  /** 누르고 있는 중이면 썸네일만 — 지나가는 원본을 다 풀면 정작 멈춘 장이 늦다 */
  const [holding, setHolding] = useState(false);
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const direction = useRef(1);
  const lastStep = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const move = useCallback(
    (delta: number) => {
      direction.current = delta;
      // 끝에서 반대편으로 돈다 — 마지막 장에서 오른쪽을 눌렀을 때 아무 일도 안 나면 고장 같다
      onIndex((index + delta + items.length) % items.length);
    },
    [index, items.length, onIndex],
  );

  /* 멈춘 장 기준으로 진행 방향 3장 + 반대쪽 1장을 미리 풀어 둔다 */
  useEffect(() => {
    if (holding || items.length < 2) return;
    const d = direction.current;
    const targets = [...Array.from({ length: PREFETCH_AHEAD }, (_, i) => d * (i + 1)), -d];
    for (const offset of targets) {
      const next = items[(index + offset + items.length * 4) % items.length];
      if (next && !next.contentType?.startsWith("video/")) prefetch(next.url);
    }
  }, [index, holding, items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // 영상 컨트롤에 포커스가 있으면 ←/→는 시킹이다 — 항목까지 넘기면 둘이 같이 돈다
      if ((e.target as HTMLElement | null)?.closest?.("video")) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const now = performance.now();
      // 반복 입력은 HOLD_STEP_MS마다 한 번만. 첫 누름(repeat 아님)은 바로
      if (e.repeat && now - lastStep.current < HOLD_STEP_MS) return;
      lastStep.current = now;
      if (e.repeat) setHolding(true);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => setHolding(false), SETTLE_MS);
      move(e.key === "ArrowLeft" ? -1 : 1);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      setHolding(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    /* 뒤가 스크롤되면 닫았을 때 엉뚱한 곳에 가 있다 */
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      document.body.style.overflow = previous;
    };
  }, [move, onClose]);

  if (!item || typeof document === "undefined") return null;

  const isVideo = item.contentType?.startsWith("video/");
  const thumb = item.thumbUrl ?? null;
  const showOriginal = !holding || !thumb;
  const originalReady = readyUrl === item.url;

  return createPortal(
    <div
      /* 바깥을 눌러야 닫힌다. 사진 자체는 안 닫는다 — 보려고 연 것을 보다가 닫히면 안 된다 */
      onClick={onClose}
      // aria-modal은 DropZone이 "뒤에 깔린 칸인가"를 가리는 표지이기도 하다
      role="dialog"
      aria-modal="true"
      aria-label={item.fileName}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-8 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full max-w-full flex-col items-center gap-3"
      >
        {isVideo ? (
          /*
            재생·멈춤만 준다 (사용자 결정 2026-08-28). 타임라인·전체화면·이어보기는 안 넣는다 —
            브라우저 기본 컨트롤이 재생/멈춤/볼륨까지는 주므로 그것만 켠다
          */
          <video
            src={item.url}
            controls
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            className="max-h-[80vh] max-w-full rounded-lg"
          />
        ) : (
          /*
            썸네일을 먼저 같은 칸에 깔고(그리드가 이미 받아 둔 것), 원본이 풀리면 그 위에 그린다.
            칸 크기는 원본이 정한다 — 원본이 아직이면 썸네일이 자리를 잡되 화면 높이에 맞춰 키운다
          */
          <div className="relative">
            {thumb && !originalReady && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                aria-hidden
                className={`${showOriginal ? "absolute inset-0 h-full w-full" : "h-[80vh] max-w-full"} rounded-lg object-contain`}
              />
            )}
            {showOriginal && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={item.url}
                src={item.url}
                alt={item.fileName}
                decoding="async"
                onLoad={(e) => {
                  const url = item.url;
                  e.currentTarget.decode().catch(() => {}).finally(() => setReadyUrl(url));
                }}
                className={`relative max-h-[80vh] max-w-full rounded-lg object-contain ${originalReady || !thumb ? "" : "opacity-0"}`}
              />
            )}
          </div>
        )}

        <div className="num flex items-center gap-3 text-[11px] text-white/45">
          <span>{item.fileName}</span>
          <span className="text-white/25">
            {index + 1} / {items.length}
          </span>
        </div>
      </div>

      {items.length > 1 && (
        <>
          <Arrow side="left" onClick={() => move(-1)} />
          <Arrow side="right" onClick={() => move(1)} />
        </>
      )}

      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute top-5 right-6 text-2xl leading-none text-white/50 transition-colors hover:text-white"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === "left" ? "이전" : "다음"}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/40 p-3 text-white/60 transition-colors hover:border-white/40 hover:text-white ${
        side === "left" ? "left-5" : "right-5"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           className="h-5 w-5">
        <path d={side === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}
