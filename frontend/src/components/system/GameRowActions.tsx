"use client";

import { useEffect, useRef, useState } from "react";
import type { GameRow } from "@/components/system/gameMaster";

/**
 * 행의 액션 — **좁아지면 `…` 하나로 접힌다** (2026-08-29).
 *
 * 버튼 셋이 가로로 붙어 있으면 좁은 폭에서 게임 이름을 밀어낸다.
 *
 * ⚠️ 기준은 **`sm`(640px)**이다 — 헤더의 프로필이 아이콘이 되는 바로 그 폭
 * (`AppHeader`의 닉네임이 `sm:inline`, 사람 아이콘이 `sm:hidden`).
 * 처음엔 `lg`(1024px)로 잡았는데 **노트북 폭에서 이미 접혀** 있었다.
 * 화면 곳곳이 제각각 접히면 "지금 좁은 화면인가"가 안 읽힌다.
 *
 * 팝오버는 바깥 클릭으로 닫는다. 스크롤로는 안 닫는다 — 목록이 길어 스크롤하다
 * 닫히면 다시 열어야 해서 성가시다
 */
export default function RowActions({
  game,
  onInfo,
  onResync,
  onDelete,
}: {
  game: GameRow;
  onInfo: () => void;
  onResync: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  /* MANUAL은 원본이 없어 재동기화가 뜻이 없다 (§10-4). **백엔드의 400은 그대로 둔다** */
  const items = (
    <>
      <ActionItem onClick={onInfo}>정보</ActionItem>
      {game.source !== "MANUAL" && <ActionItem onClick={onResync}>재동기화</ActionItem>}
      <ActionItem onClick={onDelete} danger>
        삭제
      </ActionItem>
    </>
  );

  return (
    <div ref={box} className="relative shrink-0">
      {/* 넓을 때 — 가로로 편다 */}
      <div className="hidden items-center gap-3 text-xs text-white/40 sm:flex">{items}</div>

      {/* 좁을 때 — 점 셋 */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="작업"
        className="flex h-7 w-7 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 flex min-w-28 flex-col gap-1 rounded-lg border border-white/10 bg-neutral-900 p-1.5 text-xs shadow-xl sm:hidden"
          onClick={() => setOpen(false)}
        >
          {items}
        </div>
      )}
    </div>
  );
}

function ActionItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-left transition-colors hover:bg-white/10 sm:px-0 sm:py-0 sm:hover:bg-transparent ${
        danger ? "hover:text-red-400" : "hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
