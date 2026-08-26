"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeBelow, type AnchorPlacement } from "@/lib/anchorPosition";

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
  const panelRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<AnchorPlacement | null>(null);

  /**
   * 그려졌으면 실측, 아니면 추정치.
   *
   * **첫 열기에도 실측이 되게 하려면 폴백 패널에도 ref가 있어야 한다** — 예전엔 포탈 패널에만
   * 달려 있어서, 첫 열기에는 추정치(192×160)로 배치하고 두 번째 패스가 아예 없었다.
   * 항목이 많은 메뉴를 화면 아래쪽에서 열면 그대로 화면 밖으로 넘쳤다
   */
  const panelSize = () => {
    const measured = panelRef.current?.getBoundingClientRect();
    return { width: measured?.width || 192, height: measured?.height || 160 };
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    // 전파를 끊는다 — 안 끊으면 Esc 한 번이 메뉴와 바깥 다이얼로그를 같이 닫는다
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setOpen(false);
    };

    // 스크롤·리사이즈를 따라간다. capture로 듣는 이유는 스크롤이 버블링하지 않아서다
    const reposition = () => {
      const anchor = rootRef.current?.getBoundingClientRect();
      if (anchor) setPlace(placeBelow(anchor, panelSize(), align));
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, align]);

  /*
   * 포탈 패널은 트리거의 화면 좌표를 알아야 위치를 잡는다.
   * useLayoutEffect로 재는 이유 — 그려진 뒤에 재면 패널이 (0,0)에 한 프레임 스쳤다 옮겨간다.
   *
   * **패널 높이를 실제로 잰다.** 항목 수가 상황마다 달라(관리자면 한 줄 더) 고정값을 쓸 수 없다.
   * 처음엔 추정치로 자리를 잡고, 그려진 다음 실측으로 한 번 더 맞춘다
   */
  useLayoutEffect(() => {
    if (!portal || !open) return;
    const anchor = rootRef.current?.getBoundingClientRect();
    if (!anchor) return;

    setPlace(placeBelow(anchor, panelSize(), align));
  }, [portal, open, align]);


  const panel = (close: () => void) =>
    portal && place ? (
      createPortal(
        <div
          ref={panelRef}
          className={`menu-panel fixed z-[60] overflow-y-auto ${panelClassName}`}
          style={{
            top: place.top,
            left: place.left,
            right: place.right,
            maxHeight: place.maxHeight,
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
        ref={panelRef}
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
