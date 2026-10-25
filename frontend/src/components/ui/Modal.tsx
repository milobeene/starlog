"use client";

import { useEffect, useRef } from "react";

/*
 * 겹쳐 뜬 팝업 중 **맨 위 하나만** Esc를 받는다 (점수·플레이타임 → 기록 목록 → 기록 수정).
 * 팝업마다 document 리스너를 달면 한 번의 Esc가 전부 닫는다 — 게다가 onClose가 인라인 함수라
 * 렌더마다 리스너를 다시 달면 순서가 뒤집혀 아래 팝업이 먼저 반응하기도 한다.
 * 그래서 리스너는 **하나**만 두고, 스택의 맨 위 팝업의 최신 onClose를 부른다.
 * 팝업이 아닌 것(DateField·Dropdown·Combobox 등)은 열려 있을 때 capture에서 전파를 끊으므로 여기까지 오지 않는다
 */
const stack: { close: () => void }[] = [];
const onEscape = (event: KeyboardEvent) => {
  // 한글 조합 중 Esc는 조합 취소다 — 팝업까지 닫으면 쓰던 글이 날아간다
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape") stack[stack.length - 1]?.close();
};

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
  tall = false,
  dismissible = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  /** 높이를 최대(85vh)로 고정한다 — 메모처럼 본문을 입력칸이 꽉 채우는 팝업용. 본문은 세로 flex라 `flex-1` 자식이 채운다 */
  tall?: boolean;
  /**
   * false면 Esc·바깥 누르기로는 안 닫힌다 (×·취소 버튼만). 길게 쓴 글이 있는 팝업용 —
   * 손이 미끄러진 Esc 한 번에 5,000자 메모가 확인 없이 날아갔다
   */
  dismissible?: boolean;
}) {
  const closeRef = useRef(onClose);
  const dismissRef = useRef(dismissible);
  useEffect(() => {
    closeRef.current = onClose;
    dismissRef.current = dismissible;
  });
  useEffect(() => {
    // 맨 위가 못 닫히는 팝업이면 Esc는 아무것도 안 한다 — 아래 팝업으로 넘기지도 않는다
    const entry = { close: () => dismissRef.current && closeRef.current() };
    if (stack.length === 0) document.addEventListener("keydown", onEscape);
    stack.push(entry);
    return () => {
      stack.splice(stack.indexOf(entry), 1);
      if (stack.length === 0) document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-panel flex max-h-[85vh] ${tall ? "h-[85vh]" : ""} w-full ${width} flex-col overflow-hidden rounded-xl !bg-neutral-950/92`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <h3 className="text-sm font-semibold tracking-wide text-white/90 uppercase">{title}</h3>
          <button onClick={onClose} aria-label="닫기" className="text-white/40 transition-colors hover:text-white">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 ${tall ? "flex flex-col" : ""}`}>{children}</div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
