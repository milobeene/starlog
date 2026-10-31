"use client";

import { useRef } from "react";
import { IngestProgress } from "@/components/media/IngestProgress";

/**
 * 스크린샷 격자의 **첫 칸** — 사진과 같은 크기의 "추가" 카드.
 * 끌어다 놓기는 격자 영역 전체가 받고(`useFileDrop`), 이 카드는 클릭으로 고르기 + 드롭 호버·진행을 보여 준다.
 * 파일 입력은 카드 안에 있다 — 카드가 스크롤로 빠져도 붙여넣기는 훅이 받는다
 */
export default function AddTile({
  onFiles,
  over,
  disabled,
  uploading,
  ingest,
}: {
  onFiles: (files: File[]) => void;
  /** 격자 어딘가에 파일을 끌어다 놓는 중 */
  over: boolean;
  disabled: boolean;
  uploading: boolean;
  ingest: { done: number; total: number; bytesDone: number; bytesTotal: number } | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      data-add-tile
      data-drop-zone
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="스크린샷 추가"
      title="사진·영상 고르기 (끌어다 놓거나 ⌘V도 됩니다)"
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) { e.preventDefault(); input.current?.click(); }
      }}
      className={`flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed p-3 text-center transition-colors focus-visible:ring-1 focus-visible:ring-white/50 focus-visible:outline-none ${
        disabled
          ? "cursor-not-allowed border-white/10 bg-white/[0.02]"
          : over
            ? "cursor-copy border-white/70 bg-white/15"
            : "cursor-pointer border-white/20 bg-white/[0.04] hover:border-white/40 hover:bg-white/[0.08]"
      }`}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // 같은 파일을 연속으로 고르면 change가 안 뜬다 — 값을 비워 다시 받게 한다
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      {ingest ? (
        <IngestProgress compact done={ingest.done} total={ingest.total} bytesDone={ingest.bytesDone} bytesTotal={ingest.bytesTotal} />
      ) : uploading ? (
        <p className="text-xs text-white/60">올리는 중…</p>
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-6 w-6 text-white/45" aria-hidden>
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
            <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
          <p className="text-xs leading-snug text-white/70">{over ? "놓으면 추가됩니다" : "여기에 끌어다 놓거나 클릭해서 고르세요"}</p>
          <p className="num hidden text-[10px] text-white/30 sm:block">이미지·영상 · ⌘V</p>
        </>
      )}
    </div>
  );
}
