"use client";

import { useCallback, useEffect } from "react";
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
};

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

  const move = useCallback(
    (delta: number) => {
      // 끝에서 반대편으로 돈다 — 마지막 장에서 오른쪽을 눌렀을 때 아무 일도 안 나면 고장 같다
      onIndex((index + delta + items.length) % items.length);
    },
    [index, items.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "ArrowRight") move(1);
    };
    document.addEventListener("keydown", onKey);
    /* 뒤가 스크롤되면 닫았을 때 엉뚱한 곳에 가 있다 */
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [move, onClose]);

  if (!item || typeof document === "undefined") return null;

  const isVideo = item.contentType?.startsWith("video/");

  return createPortal(
    <div
      /* 바깥을 눌러야 닫힌다. 사진 자체는 안 닫는다 — 보려고 연 것을 보다가 닫히면 안 된다 */
      onClick={onClose}
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.fileName}
            className="max-h-[80vh] max-w-full rounded-lg object-contain"
          />
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
