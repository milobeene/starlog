"use client";

/**
 * 왼쪽 목록 판넬 — 라이브러리 사이드바와 스크린샷 레일이 **같은 껍데기**를 쓴다.
 * 둘이 따로 자라면 폭·여백·유리 농도가 어긋난다 (스크린샷 레일을 처음 만들 때 실제로 그랬다).
 *
 * lg 이상은 본문 옆에 떠 있는 유리 판넬(배경 셰이더가 비친다), 미만은 화면 밖에 세워 둔 드로어다.
 * `hidden`이 아니라 translate로 밀어 넣는 이유 — 목록을 미리 받아 둬야 열자마자 스켈레톤이 아니라 내용이 보인다.
 * 열림 상태는 부모가 든다 (게임을 고르면 부모가 닫아야 한다)
 */
export default function SidePanel({
  open,
  onOpenChange,
  openLabel = "목록",
  ariaLabel,
  header,
  footer,
  listRef,
  children,
  dataAttr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 폰의 [목록] 버튼 글자 */
  openLabel?: string;
  ariaLabel?: string;
  header: React.ReactNode;
  footer?: React.ReactNode;
  listRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
  /** E2E·스타일 훅 — `data-rail` 같은 표지 */
  dataAttr?: Record<string, string>;
}) {
  return (
    <>
      {/* 열렸을 때 뒤를 눌러 닫는다. 폰에서 X 버튼만 있으면 닫기가 번거롭다 */}
      {open && (
        <button
          aria-label="목록 닫기"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-20 bg-black/50 backdrop-blur-[1px] lg:hidden"
        />
      )}

      {/* 여는 버튼 — 화면 왼쪽 아래. 엄지가 닿는 자리다. 열리면 판넬이 자리를 덮으니 숨긴다 */}
      <button
        onClick={() => onOpenChange(!open)}
        aria-label={open ? "목록 닫기" : `${openLabel} 열기`}
        aria-expanded={open}
        className={`fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2.5 text-xs font-medium tracking-wider text-white/90 uppercase backdrop-blur-md transition-opacity lg:hidden ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        {openLabel}
      </button>

      <aside
        aria-label={ariaLabel}
        {...dataAttr}
        className={`glass-panel fixed inset-y-0 left-0 z-30 mt-16 mr-2 mb-4 ml-0 flex w-64 shrink-0 flex-col overflow-hidden rounded-xl transition-transform duration-200 ease-out lg:static lg:mt-20 lg:ml-6 lg:translate-x-0 xl:w-72 ${
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 p-5">{header}</div>
        <div ref={listRef} data-panel-scroll className="flex-1 overflow-y-auto p-2">
          {children}
        </div>
        {footer}
      </aside>
    </>
  );
}

/** 판넬 머리의 제목 — `All Games (12)` 꼴 */
export function PanelTitle({ children, count }: { children: React.ReactNode; count?: number | null }) {
  return (
    <h3 className="flex-1 text-[10px] tracking-widest text-white/40 uppercase">
      {children} {count != null && <span className="num text-white/25">({count})</span>}
    </h3>
  );
}
