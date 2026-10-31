"use client";

import { useEffect, useRef, useState } from "react";
import { splitAccepted } from "@/lib/dropFiles";

/**
 * 격자 **영역 전체**가 받는 드롭 + 문서 전체의 붙여넣기.
 *
 * 추가 카드(AddTile)는 격자의 첫 칸이라 스크롤하면 창(windowing)에서 빠져 언마운트된다 —
 * 붙여넣기를 카드가 들고 있으면 아래로 내려간 순간 ⌘V가 죽는다. 그래서 듣는 일은 여기, 카드는 그리기만 한다.
 * `dragenter`/`dragleave`는 자식을 지날 때마다 번갈아 뜬다 → 깊이를 세서 0일 때만 끈다 (DropZone과 같다)
 */
export function useFileDrop({
  onFiles,
  disabled = false,
  zone,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** 위에 팝업이 떠 있을 때 "내 영역이 맨 위 층인가"를 가리는 기준 */
  zone: React.RefObject<HTMLElement | null>;
}) {
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const depth = useRef(0);

  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      // 글 입력칸에 붙이는 중이거나 위에 팝업이 있으면 건드리지 않는다
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, [contenteditable=true]") && !target.closest("[data-drop-zone]")) return;
      const modals = document.querySelectorAll('[aria-modal="true"]');
      if ([...modals].some((modal) => !modal.contains(zone.current))) return;
      e.preventDefault();
      setRejected(null);
      onFiles(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onFiles, disabled, zone]);

  const accept = (list: FileList | File[] | null) => {
    const { files, message } = splitAccepted(list, true);
    setRejected(message);
    if (files.length > 0) onFiles(files);
  };

  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    // 이게 없으면 브라우저가 파일을 그냥 열어버린다
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      depth.current -= 1;
      if (depth.current <= 0) { depth.current = 0; setOver(false); }
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (!disabled) accept(e.dataTransfer.files);
    },
  };

  return { over: over && !disabled, rejected, handlers, accept, clearRejected: () => setRejected(null) };
}
