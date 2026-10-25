"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { openCardStats } from "@/lib/cardStats";
import { actionsFor, QUICK_ACTION_LABEL, runQuickAction, type QuickAction } from "@/lib/quickPlay";
import type { EntryStatus } from "@/lib/types";

/**
 * 카드 우클릭 메뉴 (v2 U2). 상세 헤더와 같은 동작표(`actionsFor`)를 쓴다.
 *
 * 마우스 자리에 뜨는 포탈이라 Dropdown(트리거 기준)을 못 쓴다.
 * 스크롤·리사이즈·바깥 클릭·Esc에서 닫는다 — 떠 있는 채로 카드만 움직이면 엉뚱한 게임을 가리킨다.
 *
 * [점수·플레이타임]은 상세로 가지 않고 그 자리에서 팝업을 연다 (`CardStatsHost`).
 * [완료] 토스트의 [점수·시간 입력]도 같은 팝업이다
 */
export default function CardContextMenu({
  entryId,
  status,
  x,
  y,
  onClose,
}: {
  entryId: number;
  status: EntryStatus;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // 그려진 크기를 재서 화면 안으로 민다 — 오른쪽·아래 모서리 카드에서 잘린다
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - box.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - box.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const pick = (action: QuickAction) => {
    onClose();
    void runQuickAction(
      entryId,
      action,
      action === "complete"
        ? { actions: [{ label: "점수·시간 입력", run: () => openCardStats(entryId) }] }
        : undefined,
    );
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="menu-panel fixed z-[60] w-44"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {actionsFor(status).map((action) => (
        <button key={action} role="menuitem" onClick={() => pick(action)} className="menu-item">
          {QUICK_ACTION_LABEL[action]}
        </button>
      ))}
      <div role="separator" className="my-1 h-px bg-white/10" />
      <button
        role="menuitem"
        onClick={() => {
          onClose();
          openCardStats(entryId);
        }}
        className="menu-item"
      >
        점수·플레이타임
      </button>
    </div>,
    document.body,
  );
}
