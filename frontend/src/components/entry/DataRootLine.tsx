"use client";

import { useEffect, useState } from "react";
import DataRootDialog from "@/components/entry/DataRootDialog";
import { getBridge } from "@/lib/desktop";

/**
 * 데이터 폴더 한 줄.
 *
 * 설정이 이것 하나뿐이라 화면을 따로 안 만든다 — 기본값이 앱데이터 안이라
 * 아무것도 안 건드려도 되고, HDD로 옮기고 싶을 때만 누른다.
 * 그러면 **세이브·백업·커버·스크린샷이 통째로 따라간다** (architecture §5)
 */
export default function DataRootLine() {
  const [root, setRoot] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getBridge()?.settings.get().then((s) => setRoot(s.dataRoot));
  }, []);

  if (!root) return null;

  /*
   * 모드 버튼과 같은 재질로 맞춘다 (2026-08-28). 검은 알약 하나만 다른 톤이라
   * **혼자 튀어 보였다** — 배경이 밝아도 읽히게 하려던 건데 재질이 어긋나는 값이 더 컸다.
   * 대신 글자를 키우고 흰 테두리를 줘서 대비를 확보한다
   */
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-10 flex max-w-full items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-[11px] text-white/60 transition-all duration-300 hover:border-white/40 hover:text-white"
      >
        <FolderIcon />
        <span className="shrink-0">데이터 폴더</span>
        <span className="max-w-[40vw] truncate font-mono text-white/40">{root}</span>
      </button>

      {open && (
        <DataRootDialog
          current={root}
          onClose={() => setOpen(false)}
          onChanged={setRoot}
        />
      )}
    </>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
         className="h-3.5 w-3.5 shrink-0 opacity-70">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}
