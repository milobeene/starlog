"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 이미지 받는 자리 — **드롭 · 클릭 · 붙여넣기** (v1.0 6단계, architecture §10-1).
 *
 * ## 왜 새로 만들었나 🐛
 *
 * 예전 `CoverDialog`에는 **드래그앤드롭이 아예 없었다.** `<input type="file">` 하나뿐인데
 * 박스를 넓게 스타일링해둬서 **아무 데나 눌러도 될 것처럼 보였고**, 실제로는 왼쪽의 작은
 * 기본 버튼만 동작했다. 드롭이 되는 것처럼 보였던 건 브라우저가 파일 input에 기본으로
 * 주는 동작이었다.
 *
 * 셋을 다 받는 이유가 각각 다르다.
 * - **드롭** — 탐색기에서 끌어오는 게 데스크탑 앱에서 가장 자연스럽다
 * - **클릭** — 드래그를 못 하는 상황(다른 앱이 전체화면)이 있다
 * - **붙여넣기** — 스크린샷을 찍으면 클립보드에 있다. 저장하고 다시 찾는 단계가 통째로 빠진다
 *
 * ## 드래그 중 표시
 *
 * `dragenter`/`dragleave`는 **자식 요소를 지날 때마다 번갈아 뜬다.** 그냥 boolean으로 두면
 * 안쪽을 지나는 동안 테두리가 깜빡인다. 깊이를 세서 0이 될 때만 끈다
 */
export default function DropZone({
  onFiles,
  multiple = false,
  disabled = false,
  /** 영상까지 받나. 커버는 이미지만, 스크린샷은 영상도 받는다 */
  video = false,
  hint,
  children,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  video?: boolean;
  hint?: string;
  children?: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLDivElement>(null);

  /*
   * 붙여넣기는 **문서 전체**에서 듣는다. 드롭 영역에만 걸면 거기를 먼저 클릭해
   * 포커스를 줘야 하는데, 스크린샷을 찍고 온 사람은 그걸 모른다.
   * 대신 이 영역이 화면에 있을 때만 산다 — 언마운트되면 리스너도 사라진다
   */
  useEffect(() => {
    if (disabled) return;

    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      onFiles(multiple ? files : files.slice(0, 1));
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onFiles, multiple, disabled]);

  const accept = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter(
      (f) => f.type.startsWith("image/") || (video && f.type.startsWith("video/")),
    );
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      ref={zone}
      onClick={() => !disabled && input.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}   /* 이게 없으면 브라우저가 파일을 그냥 열어버린다 */
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (!disabled) accept(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      className={`relative flex min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors ${
        disabled
          ? "cursor-not-allowed border-white/10 opacity-50"
          : over
            ? "border-white/60 bg-white/10"
            : "border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept={video ? "image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" : "image/png,image/jpeg,image/webp"}
        multiple={multiple}
        onChange={(e) => {
          accept(e.target.files);
          // 같은 파일을 연속으로 고르면 change가 안 뜬다 — 값을 비워 다시 받게 한다
          e.target.value = "";
        }}
        className="hidden"
      />

      {children ?? (
        <>
          <UploadIcon />
          <p className="text-sm text-white/70">
            {over ? "놓으면 됩니다" : "여기에 끌어다 놓거나 클릭해서 고르세요"}
          </p>
          <p className="text-[11px] text-white/35">
            {hint ?? (video ? "JPG · PNG · WebP · MP4 · MOV · WebM" : "붙여넣기(⌘V)도 됩니다 · JPG · PNG · WebP")}
          </p>
        </>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
         className="h-7 w-7 text-white/40">
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
