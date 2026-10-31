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
 *
 * ## 거른 파일은 알린다
 *
 * 이미지·영상이 아닌 파일은 서버까지 안 가고 여기서 걸린다. 말없이 버리면 "드롭이 안 된다"로
 * 보이므로 서버가 같은 경우에 내는 문구(`backlog/media.ts`)를 그대로 쓴다.
 * 붙여넣기는 거르지 않고 서버로 보내서 서버가 직접 낸다
 */
export default function DropZone({
  onFiles,
  multiple = false,
  disabled = false,
  /** 영상까지 받나. 커버는 이미지만, 스크린샷은 영상도 받는다 */
  video = false,
  compact = false,
  hint,
  children,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  video?: boolean;
  /** 한 줄짜리 얇은 띠 — 격자 위에 늘 얹어 두는 자리 */
  compact?: boolean;
  hint?: string;
  children?: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const depth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const zone = useRef<HTMLDivElement>(null);

  /*
   * 붙여넣기는 **문서 전체**에서 듣는다. 드롭 영역에만 걸면 거기를 먼저 클릭해
   * 포커스를 줘야 하는데, 스크린샷을 찍고 온 사람은 그걸 모른다.
   * 대신 이 영역이 화면에 있을 때만 산다 — 언마운트되면 리스너도 사라진다.
   * 화면에 여럿 있으면(스크린샷 구역 + 커버 팝업) 맨 위 층의 칸만 받는다
   */
  useEffect(() => {
    if (disabled) return;

    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      // 위에 팝업·갤러리가 떠 있으면 뒤에 깔린 칸은 안 받는다 — 커버 팝업에 붙인 그림이
      // 스크린샷으로도 올라가던 것. 열린 팝업 전부의 안쪽에 있는 칸만 맨 위다
      // (겹친 팝업은 형제로 그리므로 아래 팝업의 칸은 위 팝업 안에 없다)
      const modals = document.querySelectorAll('[aria-modal="true"]');
      if ([...modals].some((modal) => !modal.contains(zone.current))) return;
      e.preventDefault();
      setRejected(null);
      onFiles(multiple ? files : files.slice(0, 1));
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onFiles, multiple, disabled]);

  const accept = (list: FileList | null) => {
    const all = Array.from(list ?? []);
    const files = all.filter(
      (f) => f.type.startsWith("image/") || (video && f.type.startsWith("video/")),
    );
    const skipped = all.filter((f) => !files.includes(f));

    // 서버 문구와 같은 글자 — 확장자가 없으면 파일 이름을 대신 보인다
    const kinds = [...new Set(skipped.map((f) => extensionOf(f.name)))].join(", ");
    setRejected(
      skipped.length === 0
        ? null
        : `지원하지 않는 형식입니다: ${kinds} (${
            video ? "jpg · png · webp · mp4 · mov · webm" : "jpg, png, webp만 가능"
          })`,
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
      className={`relative flex w-full cursor-pointer items-center justify-center border border-dashed text-center transition-colors ${
        compact ? "min-h-14 flex-row gap-3 rounded-lg px-4 py-3" : "min-h-40 flex-col gap-2 rounded-xl p-6"
      } ${
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
          <UploadIcon compact={compact} />
          <p className="text-sm text-white/70">
            {over ? "놓으면 됩니다" : "여기에 끌어다 놓거나 클릭해서 고르세요"}
          </p>
          <p className={`text-[11px] text-white/35 ${compact ? "hidden md:block" : ""}`}>
            {hint ?? (video ? "JPG · PNG · WebP · MP4 · MOV · WebM" : "붙여넣기(⌘V)도 됩니다 · JPG · PNG · WebP")}
          </p>
        </>
      )}

      {rejected && (
        <p role="alert" className="text-xs text-red-400">
          {rejected}
        </p>
      )}
    </div>
  );
}

/** `a.b.pdf` → `pdf`. 점이 없으면 이름 전체 */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 || dot === name.length - 1 ? name : name.slice(dot + 1).toLowerCase();
}

function UploadIcon({ compact }: { compact: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"
         className={`${compact ? "h-5 w-5" : "h-7 w-7"} text-white/40`}>
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
