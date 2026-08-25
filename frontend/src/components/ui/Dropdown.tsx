"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 정렬·프로필 공용 드롭다운.
 *
 * CSS :hover가 아니라 상태로 여닫는 이유 — hover만으로는 키보드로 못 열고
 * 터치 기기에서 첫 탭이 먹힌다. 바깥 클릭과 Esc도 여기서 닫는다
 */
export default function Dropdown({
  trigger,
  children,
  align = "right",
  panelClassName = "w-48",
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((prev) => !prev)} aria-expanded={open}>
        {trigger(open)}
      </button>

      {open && (
        <div
          className={`menu-panel absolute ${align === "right" ? "right-0" : "left-0"} top-full z-50 mt-1 ${panelClassName}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
