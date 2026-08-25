"use client";

import { useEffect } from "react";

/**
 * 다이얼로그 껍데기. `<dialog>`를 안 쓰는 이유 — 브라우저 기본 백드롭이
 * 유리 판넬 톤과 안 맞고 backdrop-filter가 안 먹는다.
 *
 * 열려 있는 동안 배경 스크롤을 막지 않는다 — body가 이미 overflow:hidden이고
 * 스크롤은 각 화면 컨테이너가 갖고 있어서 건드릴 대상이 없다.
 *
 * 판넬만 유리 판넬보다 불투명하게 덮는다 — 뒤 본문 글자가 비쳐 겹치면 폼이 안 읽힌다
 */
export default function Modal({
  title,
  onClose,
  children,
  footer,
  width = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-panel flex max-h-[85vh] w-full ${width} flex-col overflow-hidden rounded-xl !bg-neutral-950/92`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <h3 className="text-sm font-semibold tracking-wide text-white/90 uppercase">{title}</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-white/40 transition-colors hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
