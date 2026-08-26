"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  portal = false,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
  /**
   * 패널을 body로 빼서 띄운다.
   *
   * **조상이 mix-blend-mode를 쓸 때 필요하다.** 자식은 조상의 블렌딩에서 빠져나올 수 없어서,
   * 반전되는 헤더 안에 두면 메뉴 패널까지 형광색으로 뒤집힌다.
   * 포탈로 body에 붙이면 그 맥락 밖이라 정상 색으로 그려진다
   */
  portal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

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

  /*
   * 포탈 패널은 트리거의 화면 좌표를 알아야 위치를 잡는다.
   * useLayoutEffect로 재는 이유 — 그려진 뒤에 재면 패널이 (0,0)에 한 프레임 스쳤다 옮겨간다
   */
  useLayoutEffect(() => {
    if (!portal || !open) return;
    setRect(rootRef.current?.getBoundingClientRect() ?? null);
  }, [portal, open]);

  const panel = (close: () => void) =>
    portal && rect ? (
      createPortal(
        <div
          className={`menu-panel fixed z-[60] ${panelClassName}`}
          style={{
            top: rect.bottom + 4,
            ...(align === "right"
              ? { right: window.innerWidth - rect.right }
              : { left: rect.left }),
          }}
          // 바깥 클릭 판정이 rootRef를 보는데 포탈 패널은 그 밖이다 — 클릭이 새 나가지 않게 막는다
          onMouseDown={(event) => event.stopPropagation()}
        >
          {children(close)}
        </div>,
        document.body,
      )
    ) : (
      <div
        className={`menu-panel absolute ${align === "right" ? "right-0" : "left-0"} top-full z-50 mt-1 ${panelClassName}`}
      >
        {children(close)}
      </div>
    );

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((prev) => !prev)} aria-expanded={open}>
        {trigger(open)}
      </button>

      {open && panel(() => setOpen(false))}
    </div>
  );
}
